// Run with Electron; secrets arrive through a local .env, never through command arguments.
const { app, safeStorage } = require('electron');
const fs = require('node:fs'),
  path = require('node:path');
app.setPath('userData',path.join(app.getPath('appData'),'papotato-desktop'));
app.whenReady().then(() => {
  try {
    if (!safeStorage.isEncryptionAvailable())
      throw Error('A proteção de credenciais do Windows está indisponível.');
    const config = {
      projectId: process.env.FIREBASE_PROJECT_ID || 'papotato-desktop-e9fa1a',
      ownerUid: process.env.FIREBASE_HOST_OWNER_UID,
      livekitUrl: process.env.LIVEKIT_URL,
      apiKey: process.env.LIVEKIT_API_KEY,
      apiSecret: process.env.LIVEKIT_API_SECRET,
    };
    if (!config.ownerUid) throw Error('Informe FIREBASE_HOST_OWNER_UID no .env local.');
    if (!config.livekitUrl?.startsWith('wss://') || !config.apiKey || !config.apiSecret)
      throw Error('Preencha o .env local com o LiveKit Cloud.');
    const dir = path.join(app.getPath('appData'), 'PapotatoHost');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'credentials.bin'),
      safeStorage.encryptString(JSON.stringify(config)),
    );
    const source = path.resolve('.tools/cloudflared/cloudflared.exe');
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(dir, 'cloudflared.exe'));
    console.log('HOST_KEY_PROTECTED_WITH_WINDOWS_ENCRYPTION');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
