import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
test('Pages: CORS restrito, sessão bearer, convite com base, anexos e sockets', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'papotato-pages-'));
  const origin = 'https://owner.github.io';
  const { app, db, attach } = createApp({ directory, origin: origin + '/papotato-web/' });
  const server = createServer(app);
  const io = attach(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  const sockets = [];
  t.after(async () => {
    for (const s of sockets) s.close();
    io.close();
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const preflight = await request(app)
    .options('/api/auth/login')
    .set('Origin', origin)
    .set('Access-Control-Request-Headers', 'authorization,content-type,x-papotato-auth')
    .expect(204);
  assert.equal(preflight.headers['access-control-allow-origin'], origin);
  assert.match(preflight.headers['access-control-allow-headers'], /Authorization/);
  await request(app).get('/api/me').set('Origin', 'https://evil.test').expect(403);
  const users = [];
  for (let i = 0; i < 2; i++) {
    const r = await request(app)
      .post('/api/auth/register')
      .set('Origin', origin)
      .set('X-Papotato-Auth', 'bearer')
      .send({
        email: `pages${i}@example.com`,
        username: `pages${i}`,
        display: `Pessoa ${i}`,
        password: 'uma-senha-para-pages-123',
      })
      .expect(200);
    assert(r.body.sessionToken);
    assert.equal(r.headers['set-cookie'], undefined);
    users.push(r.body);
  }
  const req = (i, method, path) =>
    request(app)
      [method]('/api' + path)
      .set('Origin', origin)
      .set('Authorization', 'Bearer ' + users[i].sessionToken);
  const me = await req(0, 'get', '/me').expect(200);
  assert.equal(me.body.id, users[0].id);
  assert.equal(me.body.sessionToken, undefined);
  assert.equal(me.body.session_hash, undefined);
  const sid = (await req(0, 'post', '/spaces').send({ name: 'Amigos no Pages' }).expect(200)).body
    .id;
  const invite = (
    await req(0, 'post', '/spaces/' + sid + '/invites')
      .send({})
      .expect(200)
  ).body;
  assert(invite.url.startsWith(origin + '/papotato-web/?invite='));
  await req(1, 'post', '/invites/' + invite.code + '/join').expect(200);
  const cid = (await req(0, 'get', '/spaces/' + sid + '/channels')).body.find(
    (c) => c.kind === 'text',
  ).id;
  const f = (
    await req(0, 'post', '/channels/' + cid + '/files')
      .set('Content-Type', 'application/octet-stream')
      .set('X-File-Name', 'arquivo.txt')
      .send(Buffer.from('anexo privado real'))
      .expect(200)
  ).body;
  await req(1, 'get', '/files/' + f.id).expect(200);
  await request(app)
    .get('/api/files/' + f.id)
    .expect(401);
  for (const u of users) {
    const s = connect(url, {
      auth: { token: u.sessionToken },
      extraHeaders: { Origin: origin },
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(s);
    await new Promise((r, j) => {
      s.once('connect', r);
      s.once('connect_error', j);
    });
    await new Promise((r) => s.emit('watch', cid, r));
  }
  const received = new Promise((r, j) => {
    const timer = setTimeout(() => j(new Error('Mensagem não chegou ao outro usuário')), 3000);
    sockets[1].once('message', (m) => {
      clearTimeout(timer);
      r(m);
    });
  });
  const mid = crypto.randomUUID();
  await req(0, 'post', '/channels/' + cid + '/messages')
    .send({ id: mid, body: 'Mensagem entre origens' })
    .expect(200);
  assert.equal((await received).id, mid);
  const disconnected = new Promise((r) => sockets[1].once('disconnect', r));
  await req(1, 'post', '/auth/revoke').expect(200);
  await disconnected;
  await req(1, 'get', '/me').expect(401);
});
