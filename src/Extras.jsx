import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, Shield, X, MessagesSquare } from 'lucide-react';
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
export function UploadButton({ channel, onUploaded, onError }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="upload-button" title="Anexar arquivo (até 8 MiB)">
      <Paperclip size={20} />
      <span className="sr-only">Anexar arquivo</span>
      <input
        type="file"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 8 * 1024 * 1024) {
            onError(new Error('O limite por arquivo é 8 MiB.'));
            e.target.value = '';
            return;
          }
          setBusy(true);
          try {
            const r = await fetch('/api/channels/' + channel + '/files', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'X-File-Name': encodeURIComponent(file.name),
              },
              body: file,
            });
            const f = await r.json();
            if (!r.ok) throw new Error(f.error);
            const safeName = f.name.replace(/[\[\]()*!`]/g, '_');
            onUploaded(
              (f.mime.startsWith('image/') ? '!' : '') + '[' + safeName + '](' + f.url + ')',
            );
          } catch (e) {
            onError(e);
          } finally {
            setBusy(false);
            e.target.value = '';
          }
        }}
      />
    </label>
  );
}
export function DirectButton({ users, onOpen, onError }) {
  return (
    <button
      className="text-button"
      onClick={async () => {
        try {
          const s = await api('/direct', 'POST', { users });
          await onOpen(s.id);
        } catch (e) {
          onError(e);
        }
      }}
    >
      <MessagesSquare size={15} />
      Conversar
    </button>
  );
}
export function GroupCreator({ friends, user, onOpen, onError }) {
  const accepted = friends.filter((f) => f.state === 'accepted');
  if (!accepted.length) return null;
  return (
    <details className="group-creator">
      <summary>Criar conversa em grupo</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const users = new FormData(e.target).getAll('users');
          try {
            const s = await api('/direct', 'POST', { users });
            await onOpen(s.id);
          } catch (e) {
            onError(e);
          }
        }}
      >
        {accepted.map((f) => (
          <label className="checkbox" key={f.sender + f.recipient}>
            <input
              type="checkbox"
              name="users"
              value={f.sender === user.id ? f.recipient : f.sender}
            />
            {f.display}
          </label>
        ))}
        <small>Selecione de 1 a 7 amigos.</small>
        <button className="secondary">Abrir conversa privada</button>
      </form>
    </details>
  );
}
export function AttachmentLink({ href, children, ...props }) {
  if (href?.startsWith('/api/files/')) {
    const name = String(children);
    if (/\.(mp3|ogg)$/i.test(name))
      return (
        <span className="attachment">
          <audio controls src={href} />
          <a href={href} download>
            {children}
          </a>
        </span>
      );
    if (/\.mp4$/i.test(name))
      return (
        <span className="attachment">
          <video controls src={href} />
          <a href={href} download>
            {children}
          </a>
        </span>
      );
  }
  return (
    <a href={href} {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
export default function Extras({ space, user, members, canManage, onError, onChanged }) {
  const dialog = useRef(null);
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState([]),
    [view, setView] = useState(''),
    [notice, setNotice] = useState('');
  async function load(kind) {
    try {
      setRows(await api('/spaces/' + space.id + '/' + kind));
      setView(kind);
    } catch (e) {
      onError(e);
    }
  }
  async function moderate(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await api('/spaces/' + space.id + '/moderate', 'POST', f);
      setNotice('Ação administrativa aplicada.');
      onChanged();
    } catch (e) {
      setNotice(e.message);
    }
  }
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  if (!space) return null;
  return (
    <>
      <button
        className="extras-toggle icon"
        title="Segurança e moderação"
        aria-label="Segurança e moderação"
        onClick={() => {
          setOpen(!open);
          setNotice('');
        }}
      >
        <Shield size={20} />
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="extras-panel"
          aria-label="Segurança e moderação"
          onCancel={() => setOpen(false)}
        >
          <div className="modal-head">
            <h2>Segurança da roda</h2>
            <button className="icon" aria-label="Fechar moderação" onClick={() => setOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <p className="muted">
            Bloquear solicitações de amizade não esconde mensagens em comunidades compartilhadas.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.target));
              try {
                await api('/spaces/' + space.id + '/reports', 'POST', f);
                setNotice('Denúncia registrada para os administradores da comunidade.');
              } catch (e) {
                setNotice(e.message);
              }
            }}
          >
            <label>
              Denunciar membro
              <select name="user" required>
                {members
                  .filter((m) => m.id !== user.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Motivo
              <textarea name="reason" required maxLength={1000} />
            </label>
            <button className="secondary">Registrar denúncia</button>
          </form>
          {canManage && (
            <>
              <hr />
              <form onSubmit={moderate}>
                <label>
                  Membro
                  <select name="user" required>
                    {members
                      .filter((m) => m.id !== user.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.display} · {m.role}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Ação
                  <select name="action">
                    <option value="kick">Expulsar da comunidade</option>
                    <option value="ban">Banir da comunidade</option>
                    {space.role === 'owner' && (
                      <>
                        <option value="admin">Promover a administrador</option>
                        <option value="member">Tornar membro</option>
                        <option value="transfer">Transferir propriedade</option>
                      </>
                    )}
                  </select>
                </label>
                <label>
                  Para transferir, digite o nome da comunidade
                  <input name="confirmation" placeholder={space.name} />
                </label>
                <button className="danger">Aplicar ação ao membro selecionado</button>
              </form>
              <div className="button-row">
                <button className="secondary" onClick={() => load('audit')}>
                  Ver registro
                </button>
                <button className="secondary" onClick={() => load('reports')}>
                  Ver denúncias
                </button>
                <button className="secondary" onClick={() => load('invites')}>
                  Ver convites
                </button>
                <button className="secondary" onClick={() => load('bans')}>
                  Banimentos
                </button>
              </div>
              {view && (
                <div className="admin-records">
                  <h3>
                    {
                      {
                        audit: 'Registro de ações',
                        reports: 'Denúncias',
                        invites: 'Convites',
                        bans: 'Banimentos',
                      }[view]
                    }
                  </h3>
                  {rows.length === 0 && <p>Nenhum registro.</p>}
                  {rows.map((r) => (
                    <article key={r.id || r.code || r.user_id}>
                      <p>
                        {r.display ||
                          r.action ||
                          r.reason ||
                          (r.revoked ? 'Revogado' : r.uses + '/' + r.max_uses + ' usos')}
                      </p>
                      <small>{r.target || r.actor || r.code}</small>
                      {view === 'bans' && (
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              await api('/spaces/' + space.id + '/moderate', 'POST', {
                                user: r.user_id,
                                action: 'unban',
                              });
                              load('bans');
                            } catch (e) {
                              setNotice(e.message);
                            }
                          }}
                        >
                          Remover banimento
                        </button>
                      )}
                      {view === 'invites' && !r.revoked && (
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              await api('/invites/' + r.code, 'DELETE');
                              load('invites');
                            } catch (e) {
                              setNotice(e.message);
                            }
                          }}
                        >
                          Revogar convite
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
        </dialog>
      )}
    </>
  );
}
