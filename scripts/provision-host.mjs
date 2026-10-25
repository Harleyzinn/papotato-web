import { spawnSync } from 'node:child_process';
import electron from 'electron';
const result = spawnSync(electron, ['scripts/provision-host.cjs'], {
  stdio: 'inherit',
  windowsHide: true,
  env: process.env,
});
process.exit(result.status || 0);
