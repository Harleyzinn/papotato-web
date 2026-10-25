import React, { useEffect, useState } from 'react';
export default function DesktopUpdates() {
  const [state, setState] = useState(null),
    [dismissed, setDismissed] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const bridge = window.papotatoDesktop;
    bridge
      .updateStatus()
      .then(setState)
      .catch(() => {});
    return bridge.onUpdate((next) => setState(next));
  }, []);
  useEffect(() => {
    setDismissed(false);
    setError('');
  }, [state?.phase]);
  if (
    !state ||
    dismissed ||
    ['idle', 'disabled'].includes(state.phase) ||
    (state.phase === 'current' && !state.manual)
  )
    return null;
  return (
    <aside className="desktop-update" role="status" aria-live="polite">
      <div>
        <strong>
          {state.phase === 'ready' ? 'Papotato ' + state.version + ' disponível' : state.message}
        </strong>
        {state.phase === 'downloading' && (
          <>
            <progress max="100" value={state.percent} />
            <small>{state.percent}% · pode continuar conversando</small>
          </>
        )}
        {error && <small role="alert">{error}</small>}
      </div>
      {state.phase === 'ready' ? (
        <button
          className="primary"
          onClick={() => window.papotatoDesktop.installUpdate().catch((e) => setError(e.message))}
        >
          Reiniciar e instalar
        </button>
      ) : state.phase === 'error' ? (
        <button
          onClick={() => window.papotatoDesktop.checkUpdates().catch((e) => setError(e.message))}
        >
          Tentar novamente
        </button>
      ) : null}
      {state.phase !== 'installing' && (
        <button
          className="icon"
          aria-label="Fechar aviso de atualização"
          onClick={() => setDismissed(true)}
        >
          ×
        </button>
      )}
    </aside>
  );
}
