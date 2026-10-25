import React, { useEffect, useState } from 'react';
import { api, asset, needsBackend } from './client.js';
import { ArrowRight, RefreshCw, Server, ShieldCheck } from 'lucide-react';
export default function ServiceGate({ children }) {
  const [state, setState] = useState('checking'),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    setMessage('');
    try {
      if (needsBackend) {
        setState('setup');
        return;
      }
      const h = await api('/health');
      if (h.app !== 'papotato')
        throw new Error('Este endereço não é um servidor Papotato compatível.');
      setState('ready');
    } catch (e) {
      setMessage(e.message);
      setState('offline');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    check();
  }, []);
  if (state === 'ready') return children;
  return (
    <main className="service-page">
      <section className="service-card">
        <img src={asset('logo.svg')} alt="Papotato" />
        <span className="eyebrow">PAPO + POTATO</span>
        <h1>
          {state === 'checking'
            ? 'Preparando um bom papo…'
            : state === 'setup'
              ? 'A casa está pronta. Falta ligar o servidor.'
              : 'Não conseguimos alcançar sua turma.'}
        </h1>
        <p>
          {state === 'setup'
            ? 'O frontend está no ar. Contas, mensagens e chamadas precisam de uma API pública com banco persistente e de uma SFU LiveKit. Essa conexão ainda não foi configurada.'
            : state === 'offline'
              ? message
              : 'Verificando a conexão com o servidor Papotato.'}
        </p>
        <div className="service-checks">
          <span>
            <ShieldCheck size={18} />
            Nenhuma conversa ou conta é simulada
          </span>
          <span>
            <Server size={18} />
            Dados e chamadas ficam na infraestrutura configurada
          </span>
        </div>
        {state === 'setup' ? (
          <a
            className="primary"
            href="https://github.com/Harleyzinn/papotato-web/blob/main/docs/GITHUB_PAGES.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            Configurar o serviço compartilhado
            <ArrowRight size={18} />
          </a>
        ) : (
          <button className="primary" disabled={busy} onClick={check}>
            <RefreshCw size={18} />
            {busy ? 'Verificando…' : 'Tentar novamente'}
          </button>
        )}
        <small>
          {state === 'setup'
            ? 'O responsável precisa definir VITE_API_URL e publicar novamente.'
            : 'Se o serviço estiver iniciando, tente novamente em alguns instantes.'}
        </small>
      </section>
    </main>
  );
}
