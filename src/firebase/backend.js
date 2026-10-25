import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  getDocFromServer as getDoc,
  getDocsFromServer as getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  documentId,
  serverTimestamp,
  onSnapshot,
  connectFirestoreEmulator,
} from 'firebase/firestore';

const uuid = () => crypto.randomUUID();
const failure = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const millis = (value) => value?.toMillis?.() ?? value ?? Date.now();
function cleanProfile(id, data) {
  return {
    ...data,
    id,
    created: millis(data.created),
    lastActive: millis(data.lastActive),
    connected:
      data.status !== 'invisible' &&
      data.connected === true &&
      Date.now() - millis(data.lastActive) < 150000,
  };
}
function mime(bytes) {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216) return 'image/jpeg';
  const s = new TextDecoder().decode(bytes);
  if (s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP') return 'image/webp';
  if (s.slice(4, 8) === 'ftyp') return 'video/mp4';
  if (s.startsWith('OggS')) return 'audio/ogg';
  if (s.startsWith('ID3')) return 'audio/mpeg';
  return 'application/octet-stream';
}
const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
};
const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hash = async (bytes) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
const firebaseError = (e) => {
  const code = e.code || '';
  const messages = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
    'auth/weak-password': 'Use uma senha mais forte.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde antes de tentar novamente.',
    'auth/operation-not-allowed': 'Ative o provedor E-mail/senha no Firebase Authentication.',
    'auth/invalid-api-key': 'Configuração pública do Firebase inválida.',
    'permission-denied':
      'Acesso negado pelo Firebase. Verifique sua participação e as regras publicadas.',
    'resource-exhausted':
      'A franquia ou um limite técnico do Firebase foi atingido. O Papotato não ativa cobrança.',
    unavailable: 'O Firebase está indisponível ou sem conexão. Tente novamente.',
    'failed-precondition':
      'O Firebase precisa dos índices e regras incluídos no projeto. Confira as instruções de instalação.',
  };
  return Object.assign(new Error(messages[code] || e.message || 'Não foi possível concluir.'), {
    status: e.status || (/auth\//.test(code) ? 401 : code === 'permission-denied' ? 403 : 500),
    code,
  });
};

export function createFirebaseBackend(config, { name = 'papotato-desktop', emulators } = {}) {
  const app = initializeApp(config.firebase, name),
    auth = getAuth(app),
    db = getFirestore(app);
  if (emulators) {
    connectAuthEmulator(auth, emulators.auth, { disableWarnings: true });
    connectFirestoreEmulator(db, emulators.host || '127.0.0.1', emulators.firestorePort || 8085);
  }
  const ready = auth.authStateReady();
  const ref = (...p) => doc(db, ...p),
    list = (...p) => collection(db, ...p);
  const need = () => auth.currentUser || failure('Entre na sua conta.', 401);
  const snapshot = async (...p) => getDoc(ref(...p));
  const read = async (...p) => {
    const s = await snapshot(...p);
    return s.exists() ? { ...s.data(), id: s.id } : failure('Registro não encontrado.', 404);
  };
  const member = async (sid) => read('spaces', sid, 'members', need().uid);
  const admin = async (sid) => {
    const m = await member(sid);
    if (!['owner', 'admin'].includes(m.role)) failure('Apenas administradores.', 403);
    return m;
  };
  const channel = async (cid) => read('channels', cid);
  const profile = async (uid) => {
    const p = await read('profiles', uid);
    return cleanProfile(uid, p);
  };
  const rows = async (q) => (await getDocs(q)).docs.map((s) => ({ ...s.data(), id: s.id }));
  const indexRef = (uid, sid) => ref('userSpaces', uid, 'items', sid);
  const relationId = (a, b) => [a, b].sort().join('_');
  async function blocked(a, b) {
    const s = await Promise.all([
      snapshot('blocks', a, 'targets', b),
      snapshot('blocks', b, 'targets', a),
    ]);
    return s.some((d) => d.exists());
  }
  async function friend(a, b) {
    if (await blocked(a, b)) return false;
    const r = await snapshot('relationships', relationId(a, b));
    return r.exists() && r.data().state === 'accepted';
  }
  async function createSpace(name, description = '', kind = 'community', participants = []) {
    const uid = need().uid,
      sid =
        kind === 'community'
          ? uuid()
          : kind +
            '-' +
            (await hash(new TextEncoder().encode([...participants].sort().join('|')))).slice(0, 40);
    const existing = await snapshot('spaces', sid);
    if (existing.exists()) return { id: sid };
    const batch = writeBatch(db);
    batch.set(ref('spaces', sid), {
      name,
      description,
      owner: uid,
      kind,
      participants,
      peer_a: kind === 'direct' ? participants[0] : '',
      peer_b: kind === 'direct' ? participants[1] : '',
      created: serverTimestamp(),
    });
    batch.set(ref('spaces', sid, 'members', uid), { user_id: uid, role: 'owner', invite: null });
    batch.set(indexRef(uid, sid), { space_id: sid });
    for (const [title, type, pos] of [
      [kind === 'community' ? 'geral' : 'conversa', 'text', 0],
      [kind === 'community' ? 'Sala de estar' : 'Chamada privada', 'voice', 1],
    ]) {
      const cid = uuid();
      batch.set(ref('channels', cid), {
        id: cid,
        space_id: sid,
        name: title,
        kind: type,
        private: false,
        members: [],
        position: pos,
      });
    }
    await batch.commit();
    for (const target of participants.filter((x) => x !== uid)) {
      const b = writeBatch(db);
      b.set(ref('spaces', sid, 'members', target), {
        user_id: target,
        role: 'member',
        invite: null,
      });
      b.set(indexRef(target, sid), { space_id: sid });
      await b.commit();
    }
    return { id: sid };
  }
  async function messages(cid, { before, q: search = '' } = {}) {
    await channel(cid);
    const base = list('channels', cid, 'messages');
    let cursor;
    if (before) {
      const s = await getDoc(doc(base, before));
      if (s.exists()) cursor = s;
    }
    let found = [],
      more = true;
    while (more && found.length < 50) {
      const request = query(
        base,
        orderBy('created', 'desc'),
        orderBy(documentId(), 'desc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(50),
      );
      const batch = await getDocs(request);
      if (batch.empty) break;
      for (const d of batch.docs)
        if (
          !search ||
          d.data().body.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))
        )
          found.push(d);
      cursor = batch.docs.at(-1);
      more = !!search && batch.size === 50;
    }
    const users = new Map();
    await Promise.all(
      [...new Set(found.map((d) => d.data().user_id))].map(async (uid) => {
        users.set(uid, await profile(uid));
      }),
    );
    return found
      .slice(0, 50)
      .reverse()
      .map((s) => normalizeMessage(s, users.get(s.data().user_id)));
  }
  function normalizeMessage(s, p) {
    const d = s.data(),
      counts = {};
    for (const choices of Object.values(d.reactions || {}))
      for (const emoji of choices) counts[emoji] = (counts[emoji] || 0) + 1;
    return {
      ...d,
      id: s.id,
      seq: s.id,
      created: millis(d.created),
      edited: d.edited ? millis(d.edited) : null,
      display: p?.display || 'Membro',
      username: p?.username || '',
      reactions: Object.entries(counts).map(([emoji, count]) => ({ emoji, count })),
    };
  }
  async function messageLocation(mid) {
    const location = await read('messageLocations', mid);
    return { ...location, ref: ref('channels', location.channel_id, 'messages', mid) };
  }
  async function api(path, method = 'GET', body) {
    try {
      await ready;
      const url = new URL(path, 'https://papotato.local'),
        p = url.pathname.split('/').filter(Boolean);
      if (path === '/health') {
        const shared = auth.currentUser ? await snapshot('infrastructure', 'media') : null;
        const media = shared?.exists() ? shared.data() : {};
        const localHostReady =
          media.enabled && media.desktopUrl && Date.now() - millis(media.updatedAt) < 600000;
        return {
          ok: true,
          app: 'papotato',
          version: '0.5.0',
          backend: 'firebase',
          mediaConfigured: !!(config.mediaTokenUrl || media.renderUrl || localHostReady),
          costPolicy: { mode: 'firebase-provider-quotas', providerPlanVerifiedByApp: false },
          limits: { participantsPerCall: null },
          emailConfigured: true,
        };
      }
      if (p[0] === 'auth' && ['register', 'login'].includes(p[1])) {
        let credential;
        if (p[1] === 'register') {
          if (!/^[a-z0-9_]{3,24}$/.test(body.username) || !body.display?.trim())
            failure('Confira o nome e o usuário.');
          if (body.password.length < 12) failure('Use pelo menos 12 caracteres na senha.');
          credential = await createUserWithEmailAndPassword(auth, body.email, body.password);
          const uid = credential.user.uid;
          try {
            await runTransaction(db, async (tx) => {
              const key = ref('usernames', body.username),
                existing = await tx.get(key);
              if (existing.exists()) failure('Nome de usuário já cadastrado.', 409);
              tx.set(key, { uid });
              tx.set(ref('profiles', uid), {
                id: uid,
                username: body.username,
                display: body.display.trim(),
                bio: '',
                status: 'online',
                custom_status: '',
                created: serverTimestamp(),
                lastActive: serverTimestamp(),
                connected: true,
                revokedAt: null,
              });
            });
          } catch (e) {
            await deleteUser(credential.user).catch(() => {});
            throw e;
          }
        } else credential = await signInWithEmailAndPassword(auth, body.email, body.password);
        return await profile(credential.user.uid);
      }
      const uid = need().uid;
      if (p[0] === 'hosting') {
        const old = await snapshot('infrastructure', 'media');
        const current = old.exists()
          ? old.data()
          : {
              desktopUrl: '',
              renderUrl: config.mediaTokenUrl || '',
              enabled: false,
              mode: 'render',
            };
        if (method === 'PATCH') {
          await setDoc(ref('infrastructure', 'media'), {
            desktopUrl: body.desktopUrl ?? current.desktopUrl,
            renderUrl: body.renderUrl ?? current.renderUrl,
            enabled: body.enabled ?? current.enabled,
            mode: body.mode ?? current.mode,
            updatedAt: serverTimestamp(),
          });
          return { ok: true };
        }
        return current;
      }
      if (p[0] === 'auth' && p[1] === 'logout') {
        await updateDoc(ref('profiles', uid), { connected: false }).catch(() => {});
        await signOut(auth);
        return { ok: true };
      }
      if (p[0] === 'auth' && p[1] === 'revoke') {
        await updateDoc(ref('profiles', uid), { revokedAt: serverTimestamp(), connected: false });
        await signOut(auth);
        return { ok: true };
      }
      if (p[0] === 'me') {
        if (method === 'PATCH') {
          await updateDoc(ref('profiles', uid), {
            display: body.display,
            bio: body.bio,
            status: body.status,
            custom_status: body.custom_status,
            lastActive: serverTimestamp(),
            connected: body.status !== 'invisible',
          });
        }
        const me = await profile(uid);
        if (me.revokedAt) {
          const token = await auth.currentUser.getIdTokenResult();
          if (Number(token.claims.auth_time) * 1000 < me.revokedAt.toMillis()) {
            await signOut(auth);
            failure('Sessão revogada. Entre novamente.', 401);
          }
        }
        return me;
      }
      if (p[0] === 'spaces' && p.length === 1) {
        if (method === 'POST') return await createSpace(body.name, body.description);
        const entries = await rows(list('userSpaces', uid, 'items'));
        return (
          await Promise.all(
            entries.map(async (entry) => {
              try {
                const [s, m] = await Promise.all([
                  read('spaces', entry.space_id),
                  member(entry.space_id),
                ]);
                return { ...s, role: m.role };
              } catch (error) {
                if (error.code === 'permission-denied' || error.code === 'not-found') return null;
                throw error;
              }
            }),
          )
        ).filter(Boolean);
      }
      if (p[0] === 'spaces' && p[2] === 'channels') {
        const sid = p[1],
          m = await member(sid);
        if (method === 'POST') {
          await admin(sid);
          const cid = uuid();
          await setDoc(ref('channels', cid), {
            id: cid,
            space_id: sid,
            name: body.name,
            kind: body.kind,
            private: !!body.private,
            members: body.members || [],
            position: Date.now(),
          });
          return { id: cid };
        }
        let c;
        if (['owner', 'admin'].includes(m.role))
          c = await rows(query(list('channels'), where('space_id', '==', sid)));
        else {
          const parts = await Promise.all([
            rows(
              query(list('channels'), where('space_id', '==', sid), where('private', '==', false)),
            ),
            rows(
              query(
                list('channels'),
                where('space_id', '==', sid),
                where('members', 'array-contains', uid),
              ),
            ),
          ]);
          c = [...new Map(parts.flat().map((x) => [x.id, x])).values()];
        }
        return c.sort((a, b) => a.position - b.position).map((x) => ({ ...x, unread: 0 }));
      }
      if (p[0] === 'spaces' && p[2] === 'members') {
        const ms = await rows(list('spaces', p[1], 'members'));
        return await Promise.all(
          ms.map(async (m) => ({ ...(await profile(m.user_id)), role: m.role })),
        );
      }
      if (p[0] === 'spaces' && p[2] === 'invites') {
        await admin(p[1]);
        if (method === 'GET')
          return await rows(query(list('invites'), where('space_id', '==', p[1])));
        const space = await read('spaces', p[1]);
        if (space.kind !== 'community') failure('Conversas privadas não aceitam convites.');
        const code = uuid().replaceAll('-', '') + uuid().slice(0, 8);
        await setDoc(ref('invites', code), {
          code,
          space_id: p[1],
          name: space.name,
          expires: Date.now() + (body.hours || 24) * 3600000,
          max_uses: body.uses || 10,
          uses: 0,
          revoked: false,
          lastJoined: null,
        });
        return { code, url: code };
      }
      if (p[0] === 'invites') {
        const inviteRef = ref('invites', p[1]);
        if (method === 'DELETE') {
          await updateDoc(inviteRef, { revoked: true });
          return { ok: true };
        }
        return await runTransaction(db, async (tx) => {
          const snap = await tx.get(inviteRef);
          if (!snap.exists()) failure('Convite não encontrado.', 404);
          const invite = snap.data();
          if (invite.revoked || invite.expires < Date.now() || invite.uses >= invite.max_uses)
            failure('Convite expirado, revogado ou esgotado.', 410);
          const mr = ref('spaces', invite.space_id, 'members', uid),
            memberSnap = await tx.get(mr);
          if (memberSnap.exists()) return { id: invite.space_id };
          tx.update(inviteRef, { uses: invite.uses + 1, lastJoined: uid });
          tx.set(mr, { user_id: uid, role: 'member', invite: p[1] });
          tx.set(indexRef(uid, invite.space_id), { space_id: invite.space_id });
          return { id: invite.space_id };
        });
      }
      if (p[0] === 'channels' && p[2] === 'messages') {
        if (method === 'GET') return await messages(p[1], Object.fromEntries(url.searchParams));
        const cid = p[1],
          mid = body.id,
          channelData = await channel(cid);
        if (channelData.kind !== 'text') failure('Use um canal de texto.');
        await runTransaction(db, async (tx) => {
          const mr = ref('channels', cid, 'messages', mid),
            old = await tx.get(mr);
          if (old.exists()) {
            if (old.data().user_id !== uid) failure('Identificador em uso.', 409);
            return;
          }
          tx.set(mr, {
            id: mid,
            channel_id: cid,
            user_id: uid,
            body: body.body.trim(),
            created: serverTimestamp(),
            edited: null,
            reply_id: body.reply_id || null,
            pinned: false,
            reactions: {},
            deleted: false,
          });
          tx.set(ref('messageLocations', mid), { channel_id: cid, user_id: uid });
        });
        return normalizeMessage(
          await snapshot('channels', cid, 'messages', mid),
          await profile(uid),
        );
      }
      if (p[0] === 'channels' && p[2] === 'read') {
        await setDoc(ref('reads', uid, 'channels', p[1]), { lastRead: serverTimestamp() });
        return { ok: true };
      }
      if (p[0] === 'channels' && p[2] === 'token') {
        const shared = await snapshot('infrastructure', 'media');
        const media = shared.exists() ? shared.data() : {};
        const pc =
          media.enabled && Date.now() - millis(media.updatedAt) < 600000 ? media.desktopUrl : '';
        const render = media.renderUrl || config.mediaTokenUrl;
        const candidates = [
          ...new Set((media.mode === 'pc' ? [pc, render] : [render, pc]).filter(Boolean)),
        ];
        if (!candidates.length)
          failure(
            'Configure o emissor de tokens LiveKit em Conexão Firebase. O segredo nunca deve ficar no aplicativo.',
            503,
          );
        let response, data, lastError;
        for (const endpoint of candidates) {
          try {
            const parsed = new URL(endpoint);
            if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
              throw Error('Endereço de mídia inválido.');
            response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + (await auth.currentUser.getIdToken()),
              },
              body: JSON.stringify({ channelId: p[1] }),
              // Render Free wakes after inactivity; allow its documented cold start.
              signal: AbortSignal.timeout(
                parsed.hostname.endsWith('.onrender.com') ? 90000 : 25000,
              ),
            });
            data = await response.json();
            if (response.ok) return data;
            if (response.status === 401 || response.status === 403) break;
            lastError = data.error;
          } catch (e) {
            lastError = e.message;
          }
        }
        if (!response)
          failure('Não foi possível alcançar o servidor de chamadas. ' + (lastError || ''), 503);
        if (!response.ok)
          failure(
            data?.error ||
              'O servidor de chamadas está iniciando ou indisponível. Tente novamente.',
            response.status,
          );
        return data;
      }
      if (p[0] === 'messages') {
        const loc = await messageLocation(p[1]);
        if (method === 'PATCH') {
          await updateDoc(loc.ref, { body: body.body.trim(), edited: serverTimestamp() });
          return { ok: true };
        }
        if (method === 'DELETE') {
          await updateDoc(loc.ref, {
            body: '_Mensagem excluída._',
            deleted: true,
            edited: serverTimestamp(),
          });
          return { ok: true };
        }
        if (p[2] === 'pin') {
          await runTransaction(db, async (tx) => {
            const s = await tx.get(loc.ref);
            tx.update(loc.ref, { pinned: !s.data().pinned });
          });
          return { ok: true };
        }
        if (p[2] === 'reactions') {
          await runTransaction(db, async (tx) => {
            const s = await tx.get(loc.ref),
              data = s.data(),
              r = { ...(data.reactions || {}) },
              choices = r[uid] || [];
            r[uid] = choices.includes(body.emoji)
              ? choices.filter((x) => x !== body.emoji)
              : [...choices, body.emoji];
            tx.update(loc.ref, { reactions: r });
          });
          return { ok: true };
        }
      }
      if (p[0] === 'friends') {
        if (method === 'GET') {
          const relationships = await rows(
            query(list('relationships'), where('parties', 'array-contains', uid)),
          );
          const blockedUsers = await rows(list('blocks', uid, 'targets'));
          const result = await Promise.all(
            relationships.map(async (r) => {
              const other = r.sender === uid ? r.recipient : r.sender;
              return { ...r, ...(await profile(other)) };
            }),
          );
          for (const b of blockedUsers)
            result.push({
              sender: uid,
              recipient: b.id,
              state: 'blocked',
              ...(await profile(b.id)),
            });
          return result;
        }
        if (method === 'POST') {
          const handle = await read('usernames', body.username),
            other = handle.uid;
          if (other === uid) failure('Escolha outra pessoa.');
          if (await blocked(uid, other)) failure('Solicitação indisponível.', 403);
          const key = relationId(uid, other);
          await runTransaction(db, async (tx) => {
            const r = ref('relationships', key),
              s = await tx.get(r);
            if (s.exists()) failure('Já existe uma solicitação ou amizade.', 409);
            tx.set(r, { sender: uid, recipient: other, parties: [uid, other], state: 'pending' });
          });
          return { ok: true };
        }
        const other = p[1],
          r = ref('relationships', relationId(uid, other));
        if (body.action === 'accept') {
          await updateDoc(r, { state: 'accepted' });
        } else if (body.action === 'block') {
          const b = writeBatch(db);
          b.set(ref('blocks', uid, 'targets', other), { created: serverTimestamp() });
          b.delete(r);
          await b.commit();
        } else {
          await deleteDoc(r).catch((e) => {
            if (e.code !== 'permission-denied') throw e;
          });
          await deleteDoc(ref('blocks', uid, 'targets', other));
        }
        return { ok: true };
      }
      if (p[0] === 'direct') {
        const participants = [...new Set([uid, ...body.users])];
        for (const other of participants.filter((x) => x !== uid))
          if (!(await friend(uid, other))) failure('A conversa privada exige amizade aceita.', 403);
        const profiles = await Promise.all(participants.map(profile));
        return await createSpace(
          profiles
            .map((p) => p.display)
            .join(', ')
            .slice(0, 100),
          'Conversa privada',
          participants.length === 2 ? 'direct' : 'group',
          participants,
        );
      }
      if (p[0] === 'spaces' && ['reports', 'audit', 'bans'].includes(p[2])) {
        const sid = p[1];
        if (method === 'GET') {
          await admin(sid);
          const r = await rows(list('spaces', sid, p[2]));
          if (p[2] === 'bans')
            return await Promise.all(
              r.map(async (b) => ({ ...b, user_id: b.id, display: (await profile(b.id)).display })),
            );
          return r;
        }
        await setDoc(ref('spaces', sid, 'reports', uuid()), {
          reporter: uid,
          target: body.user,
          reason: body.reason,
          created: serverTimestamp(),
        });
        return { ok: true };
      }
      if (p[0] === 'spaces' && p[2] === 'moderate') {
        const sid = p[1],
          space = await read('spaces', sid);
        await admin(sid);
        if (body.user === uid || body.user === space.owner)
          failure('Ação inválida para este membro.');
        const target = body.user,
          b = writeBatch(db);
        if (body.action === 'transfer') {
          if (body.confirmation !== space.name) failure('Confirme digitando o nome da comunidade.');
          b.update(ref('spaces', sid), { owner: target });
          b.update(ref('spaces', sid, 'members', uid), { role: 'admin' });
          b.update(ref('spaces', sid, 'members', target), { role: 'owner' });
        } else if (['admin', 'member'].includes(body.action))
          b.update(ref('spaces', sid, 'members', target), { role: body.action });
        else if (body.action === 'unban') b.delete(ref('spaces', sid, 'bans', target));
        else {
          b.delete(ref('spaces', sid, 'members', target));
          b.delete(indexRef(target, sid));
          if (body.action === 'ban')
            b.set(ref('spaces', sid, 'bans', target), { actor: uid, created: serverTimestamp() });
        }
        b.set(ref('spaces', sid, 'audit', uuid()), {
          actor: uid,
          action: body.action + ':' + target,
          created: serverTimestamp(),
        });
        await b.commit();
        return { ok: true };
      }
      if (p[0] === 'usage') {
        return {
          backend: 'firebase',
          appQuotas: false,
          files: await rows(query(list('files'), where('user_id', '==', uid))),
        };
      }
      if (p[0] === 'files' && method === 'DELETE') {
        const f = await read('files', p[1]);
        for (let start = 0; start < f.chunks; start += 400) {
          const b = writeBatch(db);
          for (let i = start; i < Math.min(start + 400, f.chunks); i++)
            b.delete(ref('files', f.id, 'chunks', String(i).padStart(8, '0')));
          await b.commit();
        }
        await deleteDoc(ref('files', f.id));
        return { ok: true };
      }
      failure('Operação não disponível.', 404);
    } catch (e) {
      throw firebaseError(e);
    }
  }
  async function apiFetch(path, options = {}) {
    try {
      await ready;
      const uid = need().uid;
      const match = path.match(/^\/channels\/([^/]+)\/files$/);
      if (match && options.method === 'POST') {
        const body = options.body;
        if (!body?.size) failure('Arquivo vazio.');
        const cid = match[1];
        await channel(cid);
        const fid = uuid(),
          chunkSize = 128 * 1024,
          chunks = Math.ceil(body.size / chunkSize);
        const name = decodeURIComponent(
          new Headers(options.headers).get('X-File-Name') || body.name || 'arquivo',
        )
          .replace(/[\x00-\x1f<>"/\\]/g, '_')
          .slice(0, 150);
        const type = mime(new Uint8Array(await body.slice(0, 16).arrayBuffer()));
        await setDoc(ref('files', fid), {
          id: fid,
          channel_id: cid,
          user_id: uid,
          name,
          mime: type,
          size: body.size,
          chunks,
          complete: false,
          created: serverTimestamp(),
        });
        try {
          for (let i = 0; i < chunks; i++) {
            const bytes = new Uint8Array(
              await body.slice(i * chunkSize, (i + 1) * chunkSize).arrayBuffer(),
            );
            await setDoc(ref('files', fid, 'chunks', String(i).padStart(8, '0')), {
              data: toBase64(bytes),
              bytes: bytes.length,
              digest: await hash(bytes),
            });
          }
          await updateDoc(ref('files', fid), { complete: true });
        } catch (e) {
          await api('/files/' + fid, 'DELETE').catch(() => {});
          throw e;
        }
        return Response.json({ id: fid, name, mime: type, url: '/api/files/' + fid });
      }
      const fileMatch = path.match(/^\/files\/([^/]+)$/);
      if (fileMatch) {
        const f = await read('files', fileMatch[1]);
        if (!f.complete) failure('O envio deste arquivo ainda não terminou.');
        const parts = [];
        for (let i = 0; i < f.chunks; i++) {
          const c = await read('files', f.id, 'chunks', String(i).padStart(8, '0')),
            bytes = fromBase64(c.data);
          if (bytes.length !== c.bytes || (await hash(bytes)) !== c.digest)
            failure('Arquivo corrompido ou incompleto.');
          parts.push(bytes);
        }
        const blob = new Blob(parts, { type: f.mime });
        if (blob.size !== f.size) failure('Arquivo incompleto.');
        return new Response(blob, { headers: { 'Content-Type': f.mime } });
      }
      failure('Operação de arquivo inválida.');
    } catch (e) {
      const error = firebaseError(e);
      return Response.json({ error: error.message }, { status: error.status || 500 });
    }
  }
  function realtime() {
    const listeners = new Map();
    let unsubscribe,
      profileUnsubscribe,
      typingUnsubscribe,
      closed = false,
      connected = false,
      lastHeartbeat = 0,
      heartbeat;
    const trigger = (event, data) => {
      if (event === 'connect') connected = true;
      if (event === 'disconnect' || event === 'connect_error') connected = false;
      for (const cb of listeners.get(event) || []) cb(data);
    };
    const socket = {
      on(event, fn) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(fn);
        if (event === 'connect' && connected && !closed)
          queueMicrotask(() => {
            if (!closed) fn();
          });
        return socket;
      },
      emit(event, cid, ack) {
        if (event === 'watch') {
          unsubscribe?.();
          typingUnsubscribe?.();
          unsubscribe = onSnapshot(
            query(list('channels', cid, 'messages'), orderBy('created', 'desc'), limit(50)),
            async (snap) => {
              for (const change of snap.docChanges()) {
                if (change.type === 'added') {
                  try {
                    trigger(
                      'message',
                      normalizeMessage(change.doc, await profile(change.doc.data().user_id)),
                    );
                  } catch (e) {
                    trigger('connect_error', e);
                  }
                } else trigger('refresh');
              }
              ack?.({ ok: true });
            },
            (e) => {
              ack?.({ error: 'Acesso negado.' });
              trigger('connect_error', firebaseError(e));
            },
          );
          typingUnsubscribe = onSnapshot(
            list('channels', cid, 'typing'),
            (snap) => {
              for (const d of snap.docs) {
                const data = d.data();
                if (d.id !== auth.currentUser?.uid && Date.now() - millis(data.at) < 5000)
                  trigger('typing', { channel: cid, display: data.display });
              }
            },
            () => {},
          );
        } else if (event === 'typing' && auth.currentUser && Date.now() - lastHeartbeat > 2500) {
          lastHeartbeat = Date.now();
          profile(auth.currentUser.uid)
            .then((me) =>
              setDoc(ref('channels', cid, 'typing', auth.currentUser.uid), {
                display: me.display,
                at: serverTimestamp(),
              }),
            )
            .catch(() => {});
        }
        return socket;
      },
      disconnect() {
        closed = true;
        unsubscribe?.();
        typingUnsubscribe?.();
        profileUnsubscribe?.();
        clearInterval(heartbeat);
        if (typeof window !== 'undefined') {
          window.removeEventListener('online', online);
          window.removeEventListener('offline', offline);
        }
        trigger('disconnect');
      },
      connect() {
        if (!closed) trigger('connect');
      },
    };
    const online = () => trigger('connect'),
      offline = () => trigger('disconnect');
    ready.then(async () => {
      if (closed || !auth.currentUser) return;
      const uid = auth.currentUser.uid;
      profileUnsubscribe = onSnapshot(
        ref('profiles', uid),
        async (s) => {
          if (s.exists() && s.data().revokedAt) {
            const t = await auth.currentUser?.getIdTokenResult();
            if (t && Number(t.claims.auth_time) * 1000 < s.data().revokedAt.toMillis())
              trigger('session-revoked');
          }
        },
        () => trigger('disconnect'),
      );
      const beat = () =>
        updateDoc(ref('profiles', uid), { lastActive: serverTimestamp(), connected: true }).catch(
          () => {},
        );
      beat();
      heartbeat = setInterval(beat, 60000);
      online();
      if (typeof window !== 'undefined') {
        window.addEventListener('online', online);
        window.addEventListener('offline', offline);
      }
    });
    return socket;
  }
  return { api, apiFetch, realtime, auth, db, ready };
}
