import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';
test('conversa privada e anexos respeitam amizade, bloqueios e autorização', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'roda-privacy-'));
  const { app, db } = createApp({ directory });
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const a = request.agent(app),
    b = request.agent(app),
    c = request.agent(app);
  const ids = [];
  for (const [agent, name] of [
    [a, 'amigoa'],
    [b, 'amigob'],
    [c, 'intruso'],
  ])
    ids.push(
      (
        await agent
          .post('/api/auth/register')
          .send({
            email: name + '@example.com',
            display: name,
            username: name,
            password: 'senha-teste-longa-123',
          })
          .expect(200)
      ).body.id,
    );
  await a
    .post('/api/direct')
    .send({ users: [ids[1]] })
    .expect(403);
  await a.post('/api/friends').send({ username: 'amigob' }).expect(200);
  await b
    .patch('/api/friends/' + ids[0])
    .send({ action: 'accept' })
    .expect(200);
  const sid = (
    await a
      .post('/api/direct')
      .send({ users: [ids[1]] })
      .expect(200)
  ).body.id;
  assert.equal((await a.post('/api/direct').send({ users: [ids[1]] })).body.id, sid);
  const cid = (await a.get('/api/spaces/' + sid + '/channels').expect(200)).body.find(
    (x) => x.kind === 'text',
  ).id;
  await c.get('/api/channels/' + cid + '/messages').expect(403);
  await a
    .post('/api/spaces/' + sid + '/invites')
    .send({})
    .expect(403);
  const f = (
    await a
      .post('/api/channels/' + cid + '/files')
      .set('Content-Type', 'application/octet-stream')
      .set('X-File-Name', encodeURIComponent('arquivo.txt'))
      .send(Buffer.from('um arquivo real'))
      .expect(200)
  ).body;
  assert.equal(f.mime, 'application/octet-stream');
  const download = await b.get('/api/files/' + f.id).expect(200);
  assert.match(download.headers['content-disposition'], /^attachment/);
  await c.get('/api/files/' + f.id).expect(403);
  await request(app)
    .get('/api/files/' + f.id)
    .expect(401);
  await a
    .post('/api/channels/' + cid + '/files')
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.alloc(8 * 1024 * 1024 + 1))
    .expect(413);
  await b
    .patch('/api/friends/' + ids[0])
    .send({ action: 'block' })
    .expect(200);
  await a.get('/api/channels/' + cid + '/messages').expect(403);
  await a.get('/api/files/' + f.id).expect(403);
  await b.get('/api/files/' + f.id).expect(403);
});
