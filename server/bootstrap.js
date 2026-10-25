import { mkdirSync, chownSync } from 'node:fs';
import { resolve } from 'node:path';
// Railway volumes can start root-owned. Initialize only the configured mount,
// then drop privileges before importing or opening the application/database.
if (process.getuid?.() === 0 && process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  const mount = resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH);
  const directory = resolve(process.env.DATA_DIR || '/app/data');
  if (directory !== mount) throw new Error('DATA_DIR deve ser igual ao volume Railway.');
  mkdirSync(directory, { recursive: true });
  chownSync(directory, 1000, 1000);
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
}
await import('./index.js');
