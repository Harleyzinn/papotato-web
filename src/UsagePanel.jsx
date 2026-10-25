import React, { useEffect, useState } from 'react';
import { api } from './client.js';
const mib = (n) =>
  n < 1024
    ? n + ' B'
    : n < 1024 * 1024
      ? (n / 1024).toFixed(1) + ' KiB'
      : (n / 1024 / 1024).toFixed(1) + ' MiB';
export default function UsagePanel() {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(null),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      setData(await api('/usage'));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  async function remove(id) {
    setBusy(true);
    try {
      await api('/files/' + id, 'DELETE');
      setConfirm(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="usage-panel">
      <hr />
      <span className="eyebrow">PERFIL GRATUITO</span>
      <p>
        O Papotato não contrata planos nem faz upgrade automático. A conta da hospedagem deve
        permanecer Free e o projeto LiveKit, Build, sem cartão cadastrado.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error ? (
        <p>Consultando cotas…</p>
      ) : (
        data && (
          <>
            <dl className="quota-grid">
              <dt>Chamadas</dt>
              <dd>Até {data.limits.participantsPerCall} pessoas</dd>
              <dt>Seus anexos</dt>
              <dd>
                {mib(data.storage.userBytes)} / {mib(data.limits.uploadBytesPerUser)}
              </dd>
              <dt>Anexos da instalação</dt>
              <dd>
                {mib(data.storage.totalBytes)} / {mib(data.limits.uploadBytesTotal)}
              </dd>
              <dt>Downloads de anexos · {data.period} UTC</dt>
              <dd>
                {mib(data.downloadBytes)} / {mib(data.limits.downloadBytesPerMonth)}
              </dd>
            </dl>
            <small>
              Esta tela mede recursos do app, não a franquia ou a cobrança do provedor. Minutos e
              tráfego da chamada são conferidos no painel LiveKit. Quatro pessoas durante uma hora
              consomem 240 minutos-participante.
            </small>
            {data.files.length > 0 && (
              <>
                <h3>Seus arquivos</h3>
                <p>
                  Excluir libera espaço. Imagens e links desse arquivo deixam de funcionar no
                  histórico.
                </p>
                {data.files.map((f) => (
                  <div className="quota-file" key={f.id}>
                    <span>
                      {f.name}
                      <small>{mib(f.size)}</small>
                    </span>
                    {confirm === f.id ? (
                      <>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => remove(f.id)}
                        >
                          Excluir definitivamente
                        </button>
                        <button className="text-button" onClick={() => setConfirm(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button className="text-button" onClick={() => setConfirm(f.id)}>
                        Excluir arquivo
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        )
      )}
      <a
        className="text-button"
        href="https://github.com/Harleyzinn/papotato-web/blob/main/docs/FREE_ONLY.md"
        target="_blank"
        rel="noopener noreferrer"
      >
        Ver limites e configurar as contas gratuitas
      </a>
    </section>
  );
}
