const { app, safeStorage } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process'),
  { createHash } = require('node:crypto');
const directory = () => path.join(app.getPath('appData'), 'PapotatoHost');
const secretPath = () => path.join(directory(), 'credentials.bin');
function credentials() {
  if (!fs.existsSync(secretPath()) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(secretPath())));
  } catch {
    return null;
  }
}
let server,
  child,
  url = '',
  error = '',
  starting;
const status = () => ({
  available: !!credentials(),
  ownerUid: credentials()?.ownerUid,
  running: !!server && !!child && !!url,
  url,
  error,
});
async function stop() {
  url = '';
  child?.kill();
  child = null;
  if (server) {
    const current = server;
    server = null;
    await new Promise((r) => current.close(r));
  }
  return status();
}
async function start() {
  if (status().running) return status();
  if (starting) return starting;
  starting = (async () => {
    error = '';
    const config = credentials();
    if (!config) throw Error('Este computador não tem a chave local de hospedagem.');
    try {
      const metadata = require('./cloudflared.json'),
        exe = path.join(directory(), 'cloudflared.exe');
      fs.mkdirSync(directory(), { recursive: true });
      if (
        !fs.existsSync(exe) ||
        createHash('sha256').update(fs.readFileSync(exe)).digest('hex') !== metadata.sha256
      ) {
        const response = await fetch(metadata.url, { signal: AbortSignal.timeout(90000) });
        if (!response.ok) throw Error('Não foi possível baixar o conector Cloudflare.');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (createHash('sha256').update(bytes).digest('hex') !== metadata.sha256)
          throw Error('Conector reprovado na verificação de integridade.');
        fs.writeFileSync(exe, bytes);
      }
      const { createFirebaseMediaApp } = require('./media-broker.cjs');
      server = await new Promise((resolve, reject) => {
        const s = createFirebaseMediaApp(config).listen(0, '127.0.0.1', () => resolve(s));
        s.once('error', reject);
      });
      const port = server.address().port;
      child = spawn(
        exe,
        ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2'],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      child.on('error', () => {
        error = 'O conector de hospedagem não iniciou.';
      });
      child.on('exit', () => {
        url = '';
        error = 'O túnel foi encerrado. Reinicie a hospedagem ou use o Render.';
      });
      url = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error('O túnel demorou para iniciar. Verifique a conexão.')),
          60000,
        );
        const read = (data) => {
          const found = String(data).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
          if (found) {
            clearTimeout(timer);
            resolve(found[0] + '/token');
          }
        };
        child.stdout.on('data', read);
        child.stderr.on('data', read);
        child.once('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.once('exit', () => {
          clearTimeout(timer);
          reject(Error('O túnel não pôde ser aberto.'));
        });
      });
      // Wait until the public route reaches our healthy authenticated broker.
      for (let i = 0; i < 15; i++) {
        try {
          const r = await fetch(url.replace(/\/token$/, '/health'), {
            signal: AbortSignal.timeout(4000),
          });
          if (r.ok) return status();
        } catch {}
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw Error('O endereço público ainda não está acessível. Tente novamente.');
    } catch (e) {
      await stop();
      error = e.message;
      throw e;
    }
  })().finally(() => {
    starting = null;
  });
  return starting;
}
function register(ipcMain, trusted) {
  for (const [operation, fn] of Object.entries({ status, start, stop }))
    ipcMain.handle('desktop:host:' + operation, (event) => {
      if (!trusted(event)) throw Error('Origem inválida.');
      return fn();
    });
  app.on('before-quit', () => {
    child?.kill();
    server?.close();
  });
}
module.exports = { register, status, start, stop };
