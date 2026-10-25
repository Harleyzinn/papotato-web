import { spawnSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
const base = process.env.VITE_BASE_PATH || '/papotato-web/';
if (!base.startsWith('/') || !base.endsWith('/'))
  throw new Error('VITE_BASE_PATH deve começar e terminar com /.');
const api = process.env.VITE_API_URL;
if (api) {
  const u = new URL(api);
  if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname))
    throw new Error('A API pública precisa usar HTTPS.');
  if (u.username || u.password || u.search || u.hash)
    throw new Error('VITE_API_URL não pode conter credenciais, query ou fragmento.');
}
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE_PATH: base, VITE_REQUIRE_BACKEND: 'true' },
  windowsHide: true,
});
if (result.status) process.exit(result.status);
copyFileSync('dist/index.html', 'dist/404.html');
writeFileSync('dist/.nojekyll', '');
