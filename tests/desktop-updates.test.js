import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { createUpdateController } = createRequire(import.meta.url)(
  '../desktop/update-controller.cjs',
);
function setup(options = {}) {
  const updater = new EventEmitter();
  let checks = 0,
    installs = 0;
  updater.checkForUpdates = async () => {
    checks++;
    updater.emit('checking-for-update');
    return {};
  };
  updater.quitAndInstall = () => {
    installs++;
  };
  const controller = createUpdateController({ updater, version: '0.5.0', ...options });
  return { controller, updater, checks: () => checks, installs: () => installs };
}
test('Atualizador só instala após download verificado, confirmação e fora de chamada', async () => {
  let active = false,
    confirm = false;
  const s = setup({ canInstall: () => !active, confirmInstall: async () => confirm });
  assert.equal(s.updater.autoInstallOnAppQuit, false);
  assert.equal(s.updater.allowDowngrade, false);
  await assert.rejects(s.controller.install(), /terminou/);
  s.updater.emit('update-downloaded', { version: '0.5.1' });
  active = true;
  await assert.rejects(s.controller.install(), /chamada/);
  assert.equal(s.installs(), 0);
  active = false;
  await s.controller.install();
  assert.equal(s.installs(), 0);
  confirm = true;
  await s.controller.install();
  assert.equal(s.installs(), 1);
});
test('Erro de rede permite tentar novamente sem reiniciar nem desativar o aplicativo', async () => {
  const s = setup();
  s.updater.checkForUpdates = async () => {
    throw Error('offline');
  };
  await s.controller.check(true);
  assert.equal(s.controller.status().phase, 'error');
  assert.equal(s.installs(), 0);
  s.updater.checkForUpdates = async () => {
    s.updater.emit('update-not-available', {});
  };
  await s.controller.check(true);
  assert.equal(s.controller.status().phase, 'current');
});
test('Verificações simultâneas são agrupadas e desenvolvimento não procura atualização', async () => {
  const s = setup();
  await Promise.all([s.controller.check(), s.controller.check()]);
  assert.equal(s.checks(), 1);
  const dev = setup({ enabled: false });
  await dev.controller.check();
  assert.equal(dev.checks(), 0);
});
test('Entrar numa chamada durante a confirmação impede reiniciar', async () => {
  let active = false;
  const s = setup({
    canInstall: () => !active,
    confirmInstall: async () => {
      active = true;
      return true;
    },
  });
  s.updater.emit('update-downloaded', { version: '0.5.1' });
  await assert.rejects(s.controller.install(), /chamada/);
  assert.equal(s.installs(), 0);
});
