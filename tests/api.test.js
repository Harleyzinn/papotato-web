import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';

test('contas, isolamento, convites, persistência, social, sockets e revogação', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'roda-test-'));
  const { app, db, attach } = createApp({ directory });
  const server = createServer(app);
  const io = attach(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  const alice = request.agent(app),
    bob = request.agent(app),
    eve = request.agent(app);
  let sid, cid, privateId, voice, bobId, cookie, aliceCookie;
  t.after(async () => {
    io.close();
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await t.test('cadastro real e cookies seguros', async () => {
    for (const [agent, name] of [
      [alice, 'alice'],
      [bob, 'bob'],
      [eve, 'eve'],
    ]) {
      const r = await agent
        .post('/api/auth/register')
        .send({
          email: name + '@example.com',
          username: name,
          display: name,
          password: 'uma-senha-longa-123',
        })
        .expect(200);
      assert.equal(r.body.password, undefined);
      assert.equal(r.body.session_hash, undefined);
      assert.match(r.headers['set-cookie'][0], /HttpOnly/);
      if (name === 'alice') aliceCookie = r.headers['set-cookie'][0].split(';')[0];
      if (name === 'bob') {
        bobId = r.body.id;
        cookie = r.headers['set-cookie'][0].split(';')[0];
      }
    }
    await request(app).get('/api/me').expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'errada' })
      .expect(401);
  });
  await t.test('origem e autorização no servidor', async () => {
    await alice
      .post('/api/spaces')
      .set('Origin', 'https://attacker.test')
      .send({ name: 'X' })
      .expect(403);
    sid = (
      await alice.post('/api/spaces').send({ name: 'Turma', description: 'Teste real' }).expect(200)
    ).body.id;
    const c = (await alice.get('/api/spaces/' + sid + '/channels').expect(200)).body;
    cid = c.find((x) => x.kind === 'text').id;
    voice = c.find((x) => x.kind === 'voice').id;
    await bob.get('/api/channels/' + cid + '/messages').expect(403);
    await bob.post('/api/channels/' + voice + '/token').expect(403);
  });
  await t.test('limite e revogação de convites', async () => {
    const invite = (
      await alice
        .post('/api/spaces/' + sid + '/invites')
        .send({ uses: 1, hours: 1 })
        .expect(200)
    ).body;
    await bob.post('/api/invites/' + invite.code + '/join').expect(200);
    await eve.post('/api/invites/' + invite.code + '/join').expect(410);
    const revoked = (
      await alice
        .post('/api/spaces/' + sid + '/invites')
        .send({})
        .expect(200)
    ).body;
    await alice.delete('/api/invites/' + revoked.code).expect(200);
    await eve.post('/api/invites/' + revoked.code + '/join').expect(410);
  });
  await t.test('canais privados e privilégios', async () => {
    privateId = (
      await alice
        .post('/api/spaces/' + sid + '/channels')
        .send({ name: 'segredo', kind: 'text', private: true })
        .expect(200)
    ).body.id;
    await bob.get('/api/channels/' + privateId + '/messages').expect(403);
    assert(
      !(await bob.get('/api/spaces/' + sid + '/channels')).body.some((c) => c.id === privateId),
    );
    await bob
      .post('/api/spaces/' + sid + '/channels')
      .send({ name: 'invasão', kind: 'text' })
      .expect(403);
    await alice.get('/api/channels/' + privateId + '/messages').expect(200);
  });
  await t.test('mensagens idempotentes, edição, resposta, reação e busca', async () => {
    const mid = crypto.randomUUID();
    const body = { id: mid, body: 'Olá turma **real**' };
    await alice
      .post('/api/channels/' + cid + '/messages')
      .send(body)
      .expect(200);
    await alice
      .post('/api/channels/' + cid + '/messages')
      .send(body)
      .expect(200);
    let messages = (await bob.get('/api/channels/' + cid + '/messages').expect(200)).body;
    assert.equal(messages.length, 1);
    await bob
      .patch('/api/messages/' + mid)
      .send({ body: 'roubada' })
      .expect(403);
    await alice
      .patch('/api/messages/' + mid)
      .send({ body: 'Texto editado' })
      .expect(200);
    await bob
      .post('/api/channels/' + cid + '/messages')
      .send({ id: crypto.randomUUID(), body: 'Uma resposta', reply_id: mid })
      .expect(200);
    await bob
      .post('/api/messages/' + mid + '/reactions')
      .send({ emoji: '💚' })
      .expect(200);
    await alice.post('/api/messages/' + mid + '/pin').expect(200);
    messages = (await bob.get('/api/channels/' + cid + '/messages?q=editado')).body;
    assert.equal(messages.length, 1);
    assert.equal(messages[0].pinned, 1);
    assert.equal(messages[0].reactions[0].count, 1);
    const second = createApp({ directory });
    assert.equal(second.db.prepare('SELECT count(*) AS n FROM messages').get().n, 2);
    second.db.close();
  });
  await t.test('amizades, aceitar e bloquear', async () => {
    await alice.post('/api/friends').send({ username: 'bob' }).expect(200);
    const a = (await alice.get('/api/me')).body;
    await bob
      .patch('/api/friends/' + a.id)
      .send({ action: 'accept' })
      .expect(200);
    assert.equal((await alice.get('/api/friends')).body[0].state, 'accepted');
    await bob
      .patch('/api/friends/' + a.id)
      .send({ action: 'block' })
      .expect(200);
    await alice.post('/api/friends').send({ username: 'bob' }).expect(403);
  });
  await t.test('duas sessões Socket.IO recebem mensagem real e recusam canal privado', async () => {
    const aCookie = aliceCookie.split('=')[1];
    const s1 = connect(url, {
      extraHeaders: { Cookie: 'roda=' + aCookie },
      transports: ['websocket'],
      forceNew: true,
    });
    const s2 = connect(url, {
      extraHeaders: { Cookie: cookie },
      transports: ['websocket'],
      forceNew: true,
    });
    t.after(() => {
      s1.close();
      s2.close();
    });
    await Promise.all([
      new Promise((r, j) => {
        s1.once('connect', r);
        s1.once('connect_error', j);
      }),
      new Promise((r, j) => {
        s2.once('connect', r);
        s2.once('connect_error', j);
      }),
    ]);
    assert.equal(
      (await new Promise((r) => s2.emit('watch', privateId, r))).error,
      'Acesso negado.',
    );
    await Promise.all([
      new Promise((r) => s1.emit('watch', cid, r)),
      new Promise((r) => s2.emit('watch', cid, r)),
    ]);
    const received = new Promise((r, j) => {
      const timer = setTimeout(() => j(new Error('Mensagem não entregue')), 3000);
      s2.once('message', (m) => {
        clearTimeout(timer);
        r(m);
      });
    });
    await alice
      .post('/api/channels/' + cid + '/messages')
      .send({ id: crypto.randomUUID(), body: 'Mensagem entre sessões' })
      .expect(200);
    assert.equal((await received).body, 'Mensagem entre sessões');
    await bob.post('/api/auth/revoke').expect(200);
    await bob.get('/api/me').expect(401);
  });
  await t.test('moderação invalida acesso e convite não contorna banimento', async () => {
    await alice
      .post('/api/spaces/' + sid + '/moderate')
      .send({ user: bobId, action: 'ban' })
      .expect(200);
    const login = await bob
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'uma-senha-longa-123' })
      .expect(200);
    assert(login.body.id);
    await bob.get('/api/channels/' + cid + '/messages').expect(403);
    const i = (
      await alice
        .post('/api/spaces/' + sid + '/invites')
        .send({})
        .expect(200)
    ).body;
    await bob.post('/api/invites/' + i.code + '/join').expect(403);
    assert((await alice.get('/api/spaces/' + sid + '/audit')).body.length > 0);
  });
  await t.test('mídia ausente é erro explícito', async () => {
    const previous = process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_URL;
    await alice.post('/api/channels/' + voice + '/token').expect(503);
    if (previous) process.env.LIVEKIT_URL = previous;
  });
});
