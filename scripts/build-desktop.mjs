import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { build } from 'esbuild';
await build({
  entryPoints: ['desktop/updates-entry.cjs'],
  outfile: 'desktop/updates.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
});
await build({
  entryPoints: ['server/firebase-media.js'],
  outfile: 'desktop/media-broker.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  define: { 'import.meta.url': '"bundled-media-broker"' },
});
mkdirSync('desktop/assets', { recursive: true });
const png = await sharp('public/logo.svg').resize(256, 256).png().toBuffer();
writeFileSync('desktop/assets/icon.png', png);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 0;
header[7] = 0;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync('desktop/assets/icon.ico', Buffer.concat([header, png]));
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_BASE_PATH: './',
    VITE_DESKTOP: 'true',
    VITE_API_URL: '',
    VITE_REQUIRE_BACKEND: 'false',
  },
  windowsHide: true,
});
if (result.status) process.exit(result.status);
