import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('Este helper atende Windows x64. Use Docker Compose em Linux/macOS.');
const version = '1.13.11',
  name = `livekit_${version}_windows_amd64.zip`,
  base = `https://github.com/livekit/livekit/releases/download/v${version}/`;
await mkdir('.tools', { recursive: true });
await mkdir('data', { recursive: true });
const [zip, checksums] = await Promise.all([
  fetch(base + name).then((r) => {
    if (!r.ok) throw new Error('Download indisponível.');
    return r.arrayBuffer();
  }),
  fetch(base + 'checksums.txt').then((r) => r.text()),
]);
const expected = checksums
  .split('\n')
  .find((l) => l.endsWith(name))
  ?.split(/\s+/)[0];
if (!expected || createHash('sha256').update(Buffer.from(zip)).digest('hex') !== expected)
  throw new Error('Checksum inválido.');
await writeFile('.tools/livekit.zip', Buffer.from(zip));
const expanded = spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    "Expand-Archive -LiteralPath '.tools/livekit.zip' -DestinationPath '.tools/livekit' -Force",
  ],
  { stdio: 'inherit', windowsHide: true },
);
if (expanded.status) process.exit(expanded.status);
let env;
try {
  env = await readFile('.env', 'utf8');
  if (!env.includes('LIVEKIT_API_SECRET='))
    throw new Error('O .env existente precisa ser configurado manualmente.');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  env = `PORT=3000\nAPP_ORIGIN=http://localhost:3000\nLIVEKIT_URL=ws://localhost:7880\nLIVEKIT_API_KEY=roda-local\nLIVEKIT_API_SECRET=${randomBytes(32).toString('hex')}\n`;
  await writeFile('.env', env, { flag: 'wx' });
}
const vars = Object.fromEntries(
  env
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
await writeFile(
  'data/livekit-local.yaml',
  `port: 7880\nbind_addresses: ["127.0.0.1"]\nrtc:\n  tcp_port: 7881\n  port_range_start: 50000\n  port_range_end: 50100\n  use_external_ip: false\nkeys:\n  ${vars.LIVEKIT_API_KEY}: ${vars.LIVEKIT_API_SECRET}\nroom:\n  max_participants: 8\n`,
);
console.log(
  'LiveKit verificado e preparado. Execute .tools/livekit/livekit-server.exe --config data/livekit-local.yaml --dev',
);
