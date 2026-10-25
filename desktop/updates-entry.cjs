const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createUpdateController } = require('./update-controller.cjs');
function register(ipcMain, trusted, getWindow, hosting) {
  let callActive = false;
  autoUpdater.logger = { info() {}, warn() {}, error() {}, debug() {} };
  const controller = createUpdateController({
    updater: autoUpdater,
    version: app.getVersion(),
    enabled: app.isPackaged,
    notify: (state) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.webContents.send('desktop:update:state', state);
    },
    canInstall: () => !callActive,
    confirmInstall: async (version) => {
      const result = await dialog.showMessageBox(getWindow(), {
        type: 'question',
        title: 'Atualizar Papotato',
        message: 'Instalar a versão ' + version + ' e reiniciar agora?',
        detail: hosting.status().running
          ? 'A hospedagem local será encerrada durante o reinício. Sua conta, conversas e chave de hospedagem serão preservadas.'
          : 'Sua conta, conversas e configuração serão preservadas.',
        buttons: ['Reiniciar e instalar', 'Mais tarde'],
        defaultId: 1,
        cancelId: 1,
      });
      return result.response === 0;
    },
  });
  for (const [method, fn] of Object.entries({
    status: controller.status,
    check: () => controller.check(true),
    install: controller.install,
  }))
    ipcMain.handle('desktop:update:' + method, (event) => {
      if (!trusted(event)) throw Error('Origem inválida.');
      return fn();
    });
  ipcMain.on('desktop:update:call-active', (event, active) => {
    if (trusted(event)) callActive = active === true;
  });
  const initial = setTimeout(() => controller.check(), 20000),
    periodic = setInterval(() => controller.check(), 6 * 60 * 60 * 1000);
  initial.unref();
  periodic.unref();
  app.once('before-quit', () => {
    clearTimeout(initial);
    clearInterval(periodic);
  });
  return controller;
}
module.exports = { register };
