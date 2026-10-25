import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { jwtVerify } from 'jose';
import { createFirebaseMediaApp } from '../server/firebase-media.js';
test('Emissor LiveKit valida Firebase, canal e identidade; não aceita identidade do cliente', async () => {
  const secret = 'segredo-exclusivo-de-teste-com-32-caracteres';
  let allowed = true;
  const app = createFirebaseMediaApp(
    {
      projectId: 'demo-papotato',
      livekitUrl: 'wss://example.livekit.cloud',
      apiKey: 'test-key',
      apiSecret: secret,
    },
    {
      verify: async (token) => {
        if (token !== 'valid') throw Error();
        return { sub: 'trusted-user' };
      },
      read: async (path) => {
        if (!allowed) throw Object.assign(Error(), { status: 403 });
        return path.startsWith('channels/')
          ? { kind: { stringValue: 'voice' } }
          : { display: { stringValue: 'Pessoa real' } };
      },
    },
  );
  assert.equal((await request(app).post('/token').send({ channelId: 'room' })).status, 401);
  assert.equal(
    (
      await request(app)
        .post('/token')
        .set('Authorization', 'Bearer bad')
        .send({ channelId: 'room' })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .post('/token')
        .set('Origin', 'https://attacker.invalid')
        .send({ channelId: 'room' })
    ).status,
    403,
  );
  const result = await request(app)
    .post('/token')
    .set('Origin', 'papotato://app')
    .set('Authorization', 'Bearer valid')
    .send({ channelId: 'room', identity: 'forged-owner' });
  assert.equal(result.status, 200);
  const { payload } = await jwtVerify(result.body.token, new TextEncoder().encode(secret));
  assert.equal(payload.sub, 'trusted-user');
  assert.equal(payload.video.room, 'firebase-demo-papotato-room');
  assert(payload.exp - Math.floor(Date.now() / 1000) <= 300);
  assert.equal(result.body.limits.participantsPerCall, null);
  allowed = false;
  assert.equal(
    (
      await request(app)
        .post('/token')
        .set('Authorization', 'Bearer valid')
        .send({ channelId: 'room' })
    ).status,
    403,
  );
});
