function createUpdateController({
  updater,
  version,
  enabled = true,
  notify = () => {},
  confirmInstall = async () => false,
  canInstall = () => true,
}) {
  let state = {
      phase: enabled ? 'idle' : 'disabled',
      currentVersion: version,
      version: null,
      percent: 0,
      manual: false,
    },
    checking;
  function set(patch) {
    state = { ...state, ...patch };
    notify({ ...state });
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.on('checking-for-update', () =>
    set({ phase: 'checking', message: 'Buscando atualização…' }),
  );
  updater.on('update-available', (info) =>
    set({
      phase: 'downloading',
      version: info.version,
      percent: 0,
      message: 'Baixando atualização em segundo plano…',
    }),
  );
  updater.on('download-progress', (progress) =>
    set({
      phase: 'downloading',
      percent: Math.min(100, Math.max(0, Math.round(progress.percent || 0))),
    }),
  );
  updater.on('update-downloaded', (info) =>
    set({
      phase: 'ready',
      version: info.version,
      percent: 100,
      message: 'Atualização verificada e pronta para instalar.',
    }),
  );
  updater.on('update-not-available', () =>
    set({ phase: 'current', message: 'Você está usando a versão mais recente.' }),
  );
  updater.on('error', () =>
    set({
      phase: 'error',
      message:
        'Não foi possível verificar ou baixar a atualização. Sua versão continua disponível; tente novamente mais tarde.',
    }),
  );
  async function check(manual = false) {
    if (!enabled) return { ...state };
    if (checking || state.phase === 'downloading' || state.phase === 'ready')
      return checking || { ...state };
    set({ manual, phase: 'checking', message: 'Buscando atualização…' });
    checking = (async () => {
      try {
        const result = await updater.checkForUpdates();
        result?.downloadPromise?.catch(() => {});
      } catch {
        set({
          phase: 'error',
          message:
            'Não foi possível verificar ou baixar a atualização. Tente novamente mais tarde.',
        });
      }
      return { ...state };
    })().finally(() => {
      checking = null;
    });
    return checking;
  }
  async function install() {
    if (state.phase !== 'ready') throw Error('A atualização ainda não terminou de baixar.');
    if (!canInstall()) throw Error('Saia da chamada antes de reiniciar para atualizar.');
    if (!(await confirmInstall(state.version))) return { ...state };
    if (!canInstall()) throw Error('Saia da chamada antes de reiniciar para atualizar.');
    set({ phase: 'installing', message: 'Reiniciando para instalar…' });
    updater.quitAndInstall(false, true);
    return { ...state };
  }
  return { check, install, status: () => ({ ...state }) };
}
module.exports = { createUpdateController };
