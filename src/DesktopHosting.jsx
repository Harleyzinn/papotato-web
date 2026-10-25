import React, { useEffect, useState, useRef } from 'react';
import { api } from './client.js';
let prompted = false;
export default function DesktopHosting({ user }) {
  const [host, setHost] = useState(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [renderUrl, setRenderUrl] = useState('');
  const dialog = useRef();
  const available = host?.available && host.ownerUid === user.id;
  useEffect(() => {
    let active = true;
    window.papotatoDesktop
      .hostStatus()
      .then(async (status) => {
        if (!active) return;
        setHost(status);
        if (status.available && status.ownerUid === user.id) {
          const config = await api('/hosting');
          setRenderUrl(config.renderUrl || '');
          if (!prompted) {
            prompted = true;
            setOpen(true);
          }
        }
      })
      .catch((e) => setError(e.message));
    const show = () => setOpen(true);
    window.addEventListener('papotato:hosting', show);
    return () => {
      active = false;
      window.removeEventListener('papotato:hosting', show);
    };
  }, [user.id]);
  useEffect(() => {
    if (open && available && !dialog.current?.open) dialog.current?.showModal();
  }, [open, available]);
  useEffect(() => {
    if (!host?.running || !available) return;
    const tick = setInterval(async () => {
      try {
        const current = await window.papotatoDesktop.hostStatus();
        setHost(current);
        await api('/hosting', 'PATCH', {
          desktopUrl: current.url,
          enabled: current.running,
          mode: 'pc',
        });
      } catch (e) {
        setError(e.message);
      }
    }, 120000);
    return () => clearInterval(tick);
  }, [host?.running, available]);
  async function choose(mode) {
    setBusy(true);
    setError('');
    try {
      if (renderUrl) {
        const u = new URL(renderUrl);
        if (u.protocol !== 'https:' || u.username || u.password)
          throw Error('Use o endereço HTTPS /token do Render.');
      }
      if (mode === 'pc') {
        const status = await window.papotatoDesktop.hostStart();
        setHost(status);
        try {
          await api('/hosting', 'PATCH', {
            desktopUrl: status.url,
            renderUrl,
            enabled: true,
            mode,
          });
        } catch (e) {
          await window.papotatoDesktop.hostStop();
          setHost(await window.papotatoDesktop.hostStatus());
          throw e;
        }
      } else {
        await window.papotatoDesktop.hostStop();
        setHost(await window.papotatoDesktop.hostStatus());
        await api('/hosting', 'PATCH', { desktopUrl: '', renderUrl, enabled: false, mode });
      }
      dialog.current?.close();
      setOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!available) return null;
  return (
    <>
      <button className="host-switch secondary" onClick={() => setOpen(true)}>
        {host.running ? 'Hospedando no seu PC' : 'Servidor de chamadas'}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="host-dialog"
          onCancel={(event) => {
            if (busy) event.preventDefault();
            else setOpen(false);
          }}
        >
          <h2>Onde vamos hospedar hoje?</h2>
          <p>Esta escolha aparece apenas neste computador, conectado à sua conta.</p>
          <p>
            O PC hospeda o autorizador de chamadas. Áudio, vídeo e tela continuam pelo LiveKit
            Cloud; o banco continua no Firebase.
          </p>
          <label>
            Render · endereço HTTPS do emissor de tokens
            <input
              value={renderUrl}
              onChange={(e) => setRenderUrl(e.target.value)}
              placeholder="https://seu-servico.onrender.com/token"
              disabled={busy}
            />
          </label>
          <small>
            Render é opcional para hospedar no PC. O endereço será usado como alternativa quando o
            PC estiver indisponível.
          </small>
          <p>
            Ao hospedar aqui, mantenha o Papotato e o computador ligados. O túnel temporário
            gratuito depende da disponibilidade da Cloudflare.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button className="primary" disabled={busy} onClick={() => choose('pc')}>
              {busy ? 'Preparando servidor…' : 'Hospedar no meu PC'}
            </button>
            <button
              className="secondary"
              disabled={busy || !renderUrl}
              onClick={() => choose('render')}
            >
              Usar Render
            </button>
            <button
              disabled={busy}
              onClick={() => {
                dialog.current?.close();
                setOpen(false);
              }}
            >
              Agora não
            </button>
            {host.running && (
              <button disabled={busy} onClick={() => choose('render')}>
                Parar hospedagem
              </button>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
