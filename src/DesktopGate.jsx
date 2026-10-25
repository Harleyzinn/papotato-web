import React, { useEffect, useState } from 'react';
import { asset, api } from './client.js';
export function DesktopInfo() {
  const [files, setFiles] = useState([]),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState('');
  const refresh = () =>
    api('/usage')
      .then((data) => setFiles(data.files))
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, []);
  return (
    <section className="usage-panel">
      <span className="eyebrow">PAPOTATO INSTALADO · FIREBASE</span>
      <p>
        Sem cotas globais de contas, mensagens, armazenamento ou participantes impostas pelo
        aplicativo. Firebase e a infraestrutura de mídia continuam sujeitos a limites técnicos e aos
        planos das contas.
      </p>
      <div className="button-row">
        <button
          className="secondary"
          onClick={() => window.dispatchEvent(new Event('papotato:connection'))}
        >
          Conexão Firebase e LiveKit
        </button>
        <button className="secondary" onClick={() => window.papotatoDesktop.exportConfig()}>
          Exportar configuração pública
        </button>
      </div>
      <small>
        O banco é compartilhado no Firebase. O instalador não contém chave administrativa, segredo
        LiveKit ou senha de usuário.
      </small>
      <hr />
      <h3>Seus arquivos</h3>
      <p>Excluir um arquivo libera espaço no Firebase e desativa seus links no histórico.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!files.length && <small>Nenhum arquivo enviado.</small>}
      {files.map((file) => (
        <div className="quota-file" key={file.id}>
          <span>
            {file.name}
            <small>
              {(file.size / 1048576).toFixed(2)} MiB{file.complete ? '' : ' · envio incompleto'}
            </small>
          </span>
          {confirm === file.id ? (
            <>
              <button
                onClick={async () => {
                  try {
                    await api('/files/' + file.id, 'DELETE');
                    setConfirm('');
                    refresh();
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Confirmar exclusão
              </button>
              <button onClick={() => setConfirm('')}>Cancelar</button>
            </>
          ) : (
            <button onClick={() => setConfirm(file.id)}>Excluir</button>
          )}
        </div>
      ))}
    </section>
  );
}
function Setup({ initial, onDone, onCancel }) {
  const [json, setJson] = useState(
      JSON.stringify(
        initial?.firebase || { apiKey: '', projectId: '', appId: '', authDomain: '' },
        null,
        2,
      ),
    ),
    [url, setUrl] = useState(initial?.mediaTokenUrl || ''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const firebase = JSON.parse(json);
      await window.papotatoDesktop.saveConfig({ firebase, mediaTokenUrl: url.trim() });
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="service-card desktop-setup">
      <img src={asset('logo.svg')} alt="Papotato" />
      <span className="eyebrow">APLICATIVO PARA WINDOWS</span>
      <h1>Todo mundo na mesma conversa.</h1>
      <p>
        Use o mesmo projeto Firebase e servidor de mídia dos seus amigos. Cole somente a
        configuração pública do Firebase. Nunca coloque conta de serviço ou segredo LiveKit aqui.
      </p>
      <form onSubmit={submit}>
        <label>
          Configuração Firebase (JSON)
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={8}
            spellCheck={false}
            required
          />
        </label>
        <label>
          Emissor seguro de tokens LiveKit
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://seu-servico.onrender.com/token"
          />
          <small>
            Opcional para começar pelo texto. O servidor usa o Firebase para autorizar cada sala.
          </small>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar e conectar'}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </form>
      <small>Os dados exigem internet. Nenhum plano pago será ativado pelo aplicativo.</small>
    </section>
  );
}
export default function DesktopGate({ children }) {
  const [config, setConfig] = useState(undefined),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    window.papotatoDesktop.getConfig().then(setConfig);
    const open = () => setEditing(true);
    window.addEventListener('papotato:connection', open);
    return () => window.removeEventListener('papotato:connection', open);
  }, []);
  if (config === undefined) return <div className="loading">Abrindo o Papotato…</div>;
  if (!config)
    return (
      <main className="service-page">
        <Setup onDone={() => location.reload()} />
      </main>
    );
  return (
    <>
      {children}
      {editing && (
        <div className="extras-backdrop">
          <div role="dialog" aria-modal="true" aria-label="Conexão Firebase">
            <Setup
              initial={config}
              onDone={() => location.reload()}
              onCancel={() => setEditing(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
