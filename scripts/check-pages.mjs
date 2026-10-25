import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const base = process.env.VITE_BASE_PATH || '/papotato-web/';
const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
for (const path of urls.filter((x) => x.startsWith('/'))) {
  assert(path.startsWith(base), 'Caminho fora da base do Pages: ' + path);
  assert(existsSync('dist/' + path.slice(base.length)), 'Recurso ausente: ' + path);
}
assert(existsSync('dist/404.html'), 'Fallback 404 ausente');
assert(existsSync('dist/.nojekyll'), '.nojekyll ausente');
assert.equal(readFileSync('dist/404.html', 'utf8'), html);
console.log('PAGES_BUILD_OK: base, recursos, favicon e fallback de recarga verificados.');
