import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { FREE_LIMITS, currentPeriod } from '../server/limits.js';

test('cotas gratuitas: upload, exclusão, permissões e franquia mensal persistente', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'papotato-free-'));
  const { app, db } = createApp({ directory });
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const a = request.agent(app),
    b = request.agent(app);
  for (const [agent, name] of [
    [a, 'gratuitoa'],
    [b, 'gratuitob'],
  ])
    await agent
      .post('/api/auth/register')
      .send({
        username: name,
        display: name,
        email: name + '@example.com',
        password: 'uma-senha-de-teste-longa',
      })
      .expect(200);
  const health = (await a.get('/api/health')).body;
  assert.equal(health.costPolicy.mode, 'free-only');
  assert.equal(health.costPolicy.providerPlanVerifiedByApp, false);
  assert.equal(health.limits.participantsPerCall, 4);
  const sid = (await a.post('/api/spaces').send({ name: 'Gratuito' })).body.id;
  const cid = (await a.get('/api/spaces/' + sid + '/channels')).body.find(
    (c) => c.kind === 'text',
  ).id;
  const invite = (await a.post('/api/spaces/' + sid + '/invites').send({})).body;
  await b.post('/api/invites/' + invite.code + '/join').expect(200);
  const upload = (agent, bytes) =>
    agent
      .post('/api/channels/' + cid + '/files')
      .set('Content-Type', 'application/octet-stream')
      .set('X-File-Name', 'arquivo.bin')
      .send(bytes);
  const tooLarge = await upload(a, Buffer.alloc(FREE_LIMITS.uploadBytes + 1)).expect(413);
  assert.match(tooLarge.body.error, /2 MiB/);
  const ids = [];
  for (let n = 0; n < 8; n++)
    ids.push((await upload(a, Buffer.alloc(FREE_LIMITS.uploadBytes, n)).expect(200)).body.id);
  const quota = await upload(a, Buffer.from('excedente')).expect(413);
  assert.match(quota.body.error, /16 MiB/);
  await b.delete('/api/files/' + ids[0]).expect(403);
  await a.delete('/api/files/' + ids[0]).expect(200);
  const restored = (await upload(a, Buffer.alloc(FREE_LIMITS.uploadBytes)).expect(200)).body.id;
  assert.equal((await a.get('/api/usage')).body.storage.userBytes, FREE_LIMITS.uploadBytesPerUser);
  db.prepare('INSERT INTO usage_counters VALUES(?,?,?)').run(
    'file-download-bytes',
    '2000-01',
    FREE_LIMITS.downloadBytesPerMonth,
  );
  await b.get('/api/files/' + restored).expect(200);
  db.prepare(
    "UPDATE usage_counters SET value=? WHERE metric='file-download-bytes' AND period=?",
  ).run(FREE_LIMITS.downloadBytesPerMonth - FREE_LIMITS.uploadBytes, currentPeriod());
  await b.get('/api/files/' + restored).expect(200);
  await b.get('/api/files/' + restored).expect(429);
  const second = createApp({ directory });
  assert.equal(
    second.db
      .prepare("SELECT value FROM usage_counters WHERE metric='file-download-bytes' AND period=?")
      .get(currentPeriod()).value,
    FREE_LIMITS.downloadBytesPerMonth,
  );
  second.db.close();
  const bobFile = (await upload(b, Buffer.from('meu anexo')).expect(200)).body.id;
  const bob = (await b.get('/api/me')).body;
  await a
    .post('/api/spaces/' + sid + '/moderate')
    .send({ user: bob.id, action: 'ban' })
    .expect(200);
  await b.get('/api/files/' + bobFile).expect(403);
  await b.delete('/api/files/' + bobFile).expect(200);
  const mine = (await b.get('/api/usage')).body;
  assert.equal(mine.files.length, 0);
  assert.equal(mine.storage.userBytes, 0);
});
test('banco cheio responde sem apagar o histórico existente', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'papotato-full-'));
  const { app, db } = createApp({ directory });
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const a = request.agent(app);
  await a
    .post('/api/auth/register')
    .send({
      username: 'bancocheio',
      display: 'Teste',
      email: 'cheio@example.com',
      password: 'uma-senha-de-teste-longa',
    })
    .expect(200);
  const sid = (await a.post('/api/spaces').send({ name: 'Preservar' })).body.id;
  const cid = (await a.get('/api/spaces/' + sid + '/channels')).body.find(
    (c) => c.kind === 'text',
  ).id;
  const mid = crypto.randomUUID();
  await a
    .post('/api/channels/' + cid + '/messages')
    .send({ id: mid, body: 'Não apagar este histórico' })
    .expect(200);
  const pages = db.prepare('PRAGMA page_count').get().page_count;
  db.exec('PRAGMA max_page_count=' + pages);
  const full = await a
    .post('/api/channels/' + cid + '/files')
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.alloc(FREE_LIMITS.uploadBytes))
    .expect(507);
  assert.match(full.body.error, /preservados/);
  assert.equal((await a.get('/api/channels/' + cid + '/messages')).body[0].id, mid);
  assert.equal(db.prepare('SELECT count(*) AS n FROM files').get().n, 0);
});
