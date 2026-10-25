const {
  app,
  BrowserWindow,
  protocol,
  net,
  ipcMain,
  shell,
  Menu,
  session,
  dialog,
  desktopCapturer,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
// Keep the same protected Windows storage in development and in the installed app.
app.setPath('userData',path.join(app.getPath('appData'),'papotato-desktop'));
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'papotato',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
if (process.env.PAPOTATO_USER_DATA)
  app.setPath('userData', path.resolve(process.env.PAPOTATO_USER_DATA));
let mainWindow;
const configPath = () => path.join(app.getPath('userData'), 'firebase-config.json');
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-default.json'), 'utf8'));
    } catch {
      return null;
    }
  }
}
function validateConfig(config) {
  if (!config || typeof config !== 'object' || !config.firebase)
    throw new Error('Informe a configuração pública Firebase.');
  const f = config.firebase;
  for (const key of ['apiKey', 'projectId', 'appId'])
    if (typeof f[key] !== 'string' || !f[key].trim())
      throw new Error('Campo Firebase ausente: ' + key);
  if (!/^[a-z0-9-]{4,63}$/.test(f.projectId)) throw new Error('ID de projeto Firebase inválido.');
  if (config.mediaTokenUrl) {
    const u = new URL(config.mediaTokenUrl);
    if (u.protocol !== 'https:') throw new Error('O servidor de tokens precisa usar HTTPS.');
    if (u.username || u.password) throw new Error('A URL não pode conter credenciais.');
  }
  return {
    firebase: Object.fromEntries(
      ['apiKey', 'projectId', 'appId', 'authDomain', 'messagingSenderId', 'storageBucket']
        .filter((k) => typeof f[k] === 'string')
        .map((k) => [k, f[k].trim()]),
    ),
    mediaTokenUrl: config.mediaTokenUrl || '',
  };
}
function trusted(event) {
  return (
    mainWindow &&
    event.sender === mainWindow.webContents &&
    event.senderFrame?.url.startsWith('papotato://app/')
  );
}
app.setAppUserModelId('com.papotato.desktop');
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    const root = path.join(__dirname, 'dist');
    protocol.handle('papotato', async (request) => {
      const u = new URL(request.url);
      if (u.hostname !== 'app') return new Response('Not found', { status: 404 });
      let decoded;
      try {
        decoded = decodeURIComponent(u.pathname);
      } catch {
        return new Response('Invalid path', { status: 400 });
      }
      const file = path.resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
      if (!file.startsWith(root + path.sep)) return new Response('Denied', { status: 403 });
      const response = await net.fetch(pathToFileURL(file).toString());
      response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'none'; frame-src 'none'",
      );
      return response;
    });
    ipcMain.handle('desktop:config:get', (event) => {
      if (!trusted(event)) throw new Error('Origem inválida.');
      return readConfig();
    });
    ipcMain.handle('desktop:config:save', (event, config) => {
      if (!trusted(event)) throw new Error('Origem inválida.');
      const clean = validateConfig(config);
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(configPath(), JSON.stringify(clean, null, 2));
      return clean;
    });
    ipcMain.handle('desktop:config:export', async (event) => {
      if (!trusted(event)) throw new Error('Origem inválida.');
      const config = readConfig();
      if (!config) throw new Error('Configure o Firebase primeiro.');
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Compartilhar configuração pública com seus amigos',
        defaultPath: 'papotato-firebase.json',
        filters: [{ name: 'Configuração JSON', extensions: ['json'] }],
      });
      if (!result.canceled) fs.writeFileSync(result.filePath, JSON.stringify(config, null, 2));
      return !result.canceled;
    });
    ipcMain.handle('desktop:version', (event) => {
      if (!trusted(event)) throw new Error('Origem inválida.');
      return app.getVersion();
    });
    mainWindow = new BrowserWindow({
      width: 1320,
      height: 820,
      minWidth: 420,
      minHeight: 550,
      title: 'Papotato',
      backgroundColor: '#111318',
      icon: path.join(__dirname, 'assets/icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    require('./hosting.cjs').register(ipcMain, trusted);
    const ses = mainWindow.webContents.session;
    ses.setPermissionRequestHandler(async (contents, permission, callback) => {
      if (contents !== mainWindow?.webContents || !contents.getURL().startsWith('papotato://app/'))
        return callback(false);
      if (permission === 'media') {
        const r = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          title: 'Permissão de mídia',
          message: 'Permitir o uso de microfone ou câmera nesta ação?',
          detail: 'Os controles da chamada mostram quando cada dispositivo está ativo.',
          buttons: ['Permitir', 'Agora não'],
          defaultId: 1,
          cancelId: 1,
        });
        return callback(r.response === 0);
      }
      if (permission === 'notifications') {
        const r = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          message: 'Permitir notificações do Papotato?',
          buttons: ['Permitir', 'Agora não'],
          defaultId: 1,
          cancelId: 1,
        });
        return callback(r.response === 0);
      }
      callback(false);
    });
    ses.setDisplayMediaRequestHandler(async (request, callback) => {
      if (request.frame?.url && !request.frame.url.startsWith('papotato://app/'))
        return callback({});
      let picker;
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 260, height: 150 },
        });
        picker = new BrowserWindow({
          parent: mainWindow,
          modal: true,
          width: 760,
          height: 600,
          title: 'Escolha o que compartilhar',
          backgroundColor: '#191c22',
          webPreferences: {
            preload: path.join(__dirname, 'picker-preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        let finished = false;
        const getChannel = 'picker:list:' + picker.webContents.id,
          selectChannel = 'picker:select:' + picker.webContents.id;
        const finish = (source, audio) => {
          if (finished) return;
          finished = true;
          ipcMain.removeHandler(getChannel);
          ipcMain.removeAllListeners(selectChannel);
          callback(
            source
              ? {
                  video: source,
                  ...(audio && request.audioRequested && process.platform === 'win32'
                    ? { audio: 'loopback' }
                    : {}),
                }
              : {},
          );
          if (!picker.isDestroyed()) picker.close();
        };
        ipcMain.handle(getChannel, (event) =>
          event.sender === picker.webContents
            ? sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }))
            : [],
        );
        ipcMain.on(selectChannel, (event, value) => {
          if (event.sender !== picker.webContents) return;
          finish(
            sources.find((s) => s.id === value?.id),
            value?.audio === true,
          );
        });
        picker.on('closed', () => finish());
        await picker.loadFile(path.join(__dirname, 'picker.html'), {
          query: { windowId: String(picker.webContents.id) },
        });
      } catch {
        callback({});
        if (picker && !picker.isDestroyed()) picker.close();
      }
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const u = new URL(url);
        if (u.protocol === 'https:') shell.openExternal(u.href);
      } catch {}
      return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('papotato://app/')) event.preventDefault();
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'Papotato',
          submenu: [
            {
              label: 'Exportar configuração pública',
              click: () => mainWindow.webContents.send('desktop:export-config'),
            },
            { type: 'separator' },
            { role: 'quit', label: 'Sair' },
          ],
        },
        {
          label: 'Editar',
          submenu: [
            { role: 'undo', label: 'Desfazer' },
            { role: 'redo', label: 'Refazer' },
            { type: 'separator' },
            { role: 'cut', label: 'Recortar' },
            { role: 'copy', label: 'Copiar' },
            { role: 'paste', label: 'Colar' },
            { role: 'selectAll', label: 'Selecionar tudo' },
          ],
        },
        {
          label: 'Exibir',
          submenu: [
            { role: 'reload', label: 'Recarregar' },
            { role: 'resetZoom', label: 'Tamanho original' },
            { role: 'zoomIn', label: 'Aumentar' },
            { role: 'zoomOut', label: 'Diminuir' },
            { role: 'togglefullscreen', label: 'Tela cheia' },
          ],
        },
        {
          label: 'Ajuda',
          submenu: [
            {
              label: 'Instruções',
              click: () =>
                shell.openExternal(
                  'https://github.com/Harleyzinn/papotato-web/blob/main/docs/DESKTOP_FIREBASE.md',
                ),
            },
          ],
        },
      ]),
    );
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    mainWindow.loadURL('papotato://app/index.html');
  });
  app.on('window-all-closed', () => app.quit());
}
