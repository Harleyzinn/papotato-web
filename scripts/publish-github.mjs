// Uses the existing OS Git credential helper, without logging or storing credentials.
import { spawnSync } from 'node:child_process';
const result = spawnSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n',
  encoding: 'utf8',
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  timeout: 15000,
  windowsHide: true,
});
if (result.status !== 0) {
  console.log('GITHUB_LOCAL_AUTH_UNAVAILABLE');
  process.exit(2);
}
const fields = Object.fromEntries(
  result.stdout
    .trim()
    .split('\n')
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
if (!fields.password) {
  console.log('GITHUB_LOCAL_AUTH_UNAVAILABLE');
  process.exit(2);
}
const headers = {
  Authorization: 'Bearer ' + fields.password,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};
const profile = await fetch('https://api.github.com/user', { headers });
if (!profile.ok) {
  console.log('GITHUB_LOCAL_AUTH_REJECTED');
  process.exit(2);
}
const { login } = await profile.json();
const name = 'roda-comunicacao';
const existing = await fetch('https://api.github.com/repos/' + login + '/' + name, { headers });
if (existing.status !== 404) {
  console.log('Repository already exists or cannot be checked; refusing to overwrite.');
  process.exit(2);
}
const r = await fetch('https://api.github.com/user/repos', {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name,
    description: 'Roda: comunidades, texto persistente e chamadas com LiveKit.',
    private: true,
    auto_init: false,
  }),
});
if (!r.ok) {
  console.log('Repository creation unavailable: HTTP ' + r.status);
  process.exit(2);
}
const repo = await r.json();
console.log(repo.html_url);
const remote = spawnSync('git', ['remote', 'add', 'origin', repo.clone_url], {
  encoding: 'utf8',
  windowsHide: true,
});
if (remote.status !== 0) {
  console.log('Remote configuration requires review.');
  process.exit(2);
}
const push = spawnSync('git', ['push', '-u', 'origin', 'HEAD'], {
  encoding: 'utf8',
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  timeout: 120000,
  windowsHide: true,
});
console.log(push.status === 0 ? 'PUSH_OK' : 'PUSH_FAILED');
process.exit(push.status || 0);
