import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
const executable = '.tools/livekit/livekit-server.exe';
if (!existsSync(executable))
  throw new Error('Execute npm run setup:media primeiro. Em Linux/macOS use Docker Compose.');
const child = spawn(executable, ['--config', 'data/livekit-local.yaml'], {
  stdio: 'inherit',
  windowsHide: true,
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
child.on('exit', (code) => process.exit(code || 0));
