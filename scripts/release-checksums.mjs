import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync('desktop/package.json', 'utf8'));
const filename = `Papotato-Setup-${version}.exe`;
const sum = createHash('sha256')
  .update(readFileSync('release/' + filename))
  .digest('hex');
writeFileSync('release/SHA256SUMS.txt', `${sum}  ${filename}\n`);
