import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, updateDoc, getDoc, setDoc, serverTimestamp, terminate } from 'firebase/firestore';
import { deleteApp } from 'firebase/app';
import { createFirebaseBackend } from '../../src/firebase/backend.js';

test('Firebase real emulado: contas, convites atômicos, acesso, chat e arquivos', async (t) => {
  const projectId = 'demo-papotato';
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8085,
      rules: readFileSync('firebase/firestore.rules', 'utf8'),
    },
  });
  await env.clearFirestore();
  const clients = [];
  for (const name of ['alice', 'bob', 'eve'])
    clients.push(
      createFirebaseBackend(
        {
          firebase: {
            projectId,
            apiKey: 'demo-key',
            appId: 'demo-app',
            authDomain: 'demo-papotato.firebaseapp.com',
          },
        },
        {
          name: 'test-' + name + '-' + crypto.randomUUID(),
          emulators: { auth: 'http://127.0.0.1:9099', host: '127.0.0.1', firestorePort: 8085 },
        },
      ),
    );
  t.after(async () => {
    for (const c of clients) {
      await terminate(c.db);
      await deleteApp(c.auth.app);
    }
    await env.cleanup();
  });
  const [a, b, e] = clients,
    people = [];
  for (let i = 0; i < 3; i++) {
    const name = ['alice', 'bob', 'eve'][i] + crypto.randomUUID().slice(0, 5);
    people.push(
      await clients[i].api('/auth/register', 'POST', {
        email: name + '@example.invalid',
        password: 'senha-de-emulador-123',
        username: name,
        display: name,
      }),
    );
  }
  assert.equal(people[0].id, a.auth.currentUser.uid);
  await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'infrastructure','owner'),{uid:people[0].id}));
  await assert.rejects(e.api('/hosting','PATCH',{desktopUrl:'https://host-test.trycloudflare.com/token',enabled:true,mode:'pc'}),/Acesso negado/);
  await a.api('/hosting','PATCH',{desktopUrl:'https://host-test.trycloudflare.com/token',enabled:true,mode:'pc'});
  assert.equal((await b.api('/hosting')).mode,'pc');
  assert.equal((await b.api('/health')).mediaConfigured,true,'A configuração compartilhada deve habilitar chamadas sem URL local');
  await assertFails(updateDoc(doc(b.db,'infrastructure','owner'),{uid:people[1].id}));
  await assert.rejects(a.api('/hosting','PATCH',{desktopUrl:'http://attacker.invalid/token',enabled:true,mode:'pc'}),/Acesso negado/);
  const sid = (
    await a.api('/spaces', 'POST', { name: 'Turma real', description: 'Firebase de teste' })
  ).id;
  let channels = await a.api('/spaces/' + sid + '/channels');
  const cid = channels.find((c) => c.kind === 'text').id;
  await assert.rejects(e.api('/channels/' + cid + '/messages'), /Acesso negado/);
  const invite = await a.api('/spaces/' + sid + '/invites', 'POST', { hours: 1, uses: 1 });
  await b.api('/invites/' + invite.code + '/join', 'POST');
  await assert.rejects(e.api('/invites/' + invite.code + '/join', 'POST'), /esgotado/);
  const priv = (
    await a.api('/spaces/' + sid + '/channels', 'POST', {
      name: 'privado',
      kind: 'text',
      private: true,
      members: [],
    })
  ).id;
  channels = await b.api('/spaces/' + sid + '/channels');
  assert(!channels.some((c) => c.id === priv));
  await assert.rejects(b.api('/channels/' + priv + '/messages'), /Acesso negado/);
  await assertFails(
    updateDoc(doc(b.db, 'spaces', sid, 'members', people[1].id), { role: 'admin' }),
  );
  const mid = crypto.randomUUID();
  await a.api('/channels/' + cid + '/messages', 'POST', {
    id: mid,
    body: 'Mensagem persistida',
    reply_id: null,
  });
  await a.api('/channels/' + cid + '/messages', 'POST', {
    id: mid,
    body: 'Mensagem persistida',
    reply_id: null,
  });
  assert.equal((await b.api('/channels/' + cid + '/messages')).length, 1);
  await assert.rejects(b.api('/messages/' + mid, 'PATCH', { body: 'forjada' }), /Acesso negado/);
  await a.api('/messages/' + mid, 'PATCH', { body: 'Texto editado' });
  await b.api('/messages/' + mid + '/reactions', 'POST', { emoji: '💚' });
  await a.api('/messages/' + mid + '/pin', 'POST');
  const messages = await b.api('/channels/' + cid + '/messages?q=editado');
  assert.equal(messages[0].body, 'Texto editado');
  assert.equal(messages[0].reactions[0].count, 1);
  assert.equal(messages[0].pinned, true);
  const sockets = [a.realtime(), b.realtime()];
  t.after(() => sockets.forEach((s) => s.disconnect()));
  await Promise.all(sockets.map((s) => new Promise((r) => s.on('connect', r))));
  await Promise.all(sockets.map((s) => new Promise((r) => s.emit('watch', cid, r))));
  const fresh = crypto.randomUUID();
  const received = new Promise((r, j) => {
    const timer = setTimeout(
      () => j(new Error('Mensagem não chegou em outra sessão Firebase')),
      7000,
    );
    sockets[1].on('message', (m) => {
      if (m.id === fresh) {
        clearTimeout(timer);
        r(m);
      }
    });
  });
  await a.api('/channels/' + cid + '/messages', 'POST', {
    id: fresh,
    body: 'Realtime entre clientes',
    reply_id: null,
  });
  assert.equal((await received).body, 'Realtime entre clientes');
  const file = new Blob([new Uint8Array(3 * 1024 * 1024).fill(23)]);
  const upload = await a.apiFetch('/channels/' + cid + '/files', {
    method: 'POST',
    headers: { 'X-File-Name': 'arquivo-real.bin' },
    body: file,
  });
  assert.equal(upload.status, 200);
  const uploaded = await upload.json();
  const downloaded = await b.apiFetch('/files/' + uploaded.id);
  assert.equal(downloaded.status, 200);
  assert.equal((await downloaded.blob()).size, file.size);
  assert.equal((await e.apiFetch('/files/' + uploaded.id)).status, 403);
  await assert.rejects(b.api('/files/' + uploaded.id, 'DELETE'), /Acesso negado/);
  await a.api('/friends', 'POST', { username: people[1].username });
  await b.api('/friends/' + people[0].id, 'PATCH', { action: 'accept' });
  const direct = (await a.api('/direct', 'POST', { users: [people[1].id] })).id;
  assert((await b.api('/spaces')).some((s) => s.id === direct));
  await a.api('/spaces/' + sid + '/moderate', 'POST', { user: people[1].id, action: 'ban' });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    assert(
      !(await getDoc(doc(d, 'spaces', sid, 'members', people[1].id))).exists(),
      'Banimento remove associação',
    );
    assert(
      (await getDoc(doc(d, 'spaces', sid, 'bans', people[1].id))).exists(),
      'Banimento persistido',
    );
  });
  await assert.rejects(b.api('/channels/' + cid + '/messages'), /Acesso negado/);
  assert((await a.api('/spaces/' + sid + '/audit')).length > 0);
  await a.api('/files/' + uploaded.id, 'DELETE');
  assert.equal((await a.api('/usage')).files.length, 0);
  await b.api('/friends/' + people[0].id, 'PATCH', { action: 'block' });
  const dmChannels = await a.api('/spaces/' + direct + '/channels').catch(() => []);
  assert.equal(dmChannels.length, 0);
});
