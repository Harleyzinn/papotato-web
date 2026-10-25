import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { parse, serialize } from 'cookie';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { Server } from 'socket.io';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { z } from 'zod';
import { openDatabase } from './db.js';
import { FREE_LIMITS, COST_POLICY, currentPeriod } from './limits.js';

const digest = (v) => createHash('sha256').update(v).digest('hex');
const id = () => randomUUID();
const text = (max = 100) => z.string().trim().min(1).max(max);
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const publicUser = (u) => {
  const { password, email, session_hash, ...safe } = u;
  return safe;
};
export function createApp({
  directory = process.env.DATA_DIR || './data',
  origin = process.env.APP_ORIGIN || 'http://localhost:3000',
} = {}) {
  const allowedOrigin = new URL(origin).origin;
  const publicUrl = (process.env.APP_PUBLIC_URL || origin).replace(/\/$/, '') + '/';
  const db = openDatabase(directory);
  const app = express();
  let io;
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const quota = (count, limit, message) => {
    if (count >= limit) fail(429, message);
  };
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production'
          ? {
              directives: {
                'connect-src': ["'self'", 'wss:'],
                'img-src': ["'self'", 'data:', 'blob:'],
                'media-src': ["'self'", 'blob:'],
              },
            }
          : false,
    }),
  );
  app.use('/api', (req, res, next) => {
    const requestOrigin = req.headers.origin;
    if (requestOrigin && requestOrigin !== allowedOrigin)
      return res.status(403).json({ error: 'Origem não autorizada.' });
    if (requestOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, X-File-Name, X-Papotato-Auth',
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use(
    '/api',
    rateLimit({ windowMs: 60000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use('/api', (req, res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== allowedOrigin
    )
      return res.status(403).json({ error: 'Origem não autorizada.' });
    next();
  });
  const authenticate = (cookie, authorization) => {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : parse(cookie || '').roda;
    return (
      token &&
      get(
        'SELECT u.*,s.hash AS session_hash FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires>?',
        digest(token),
        Date.now(),
      )
    );
  };
  app.use('/api', (req, res, next) => {
    req.user = authenticate(req.headers.cookie, req.headers.authorization);
    next();
  });
  const auth = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: 'Entre na sua conta.' });
  const route = (method, path, fn, secure = true) =>
    app[method]('/api' + path, ...(secure ? [auth] : []), async (req, res, next) => {
      try {
        const result = await fn(req, res);
        if (!res.headersSent) res.json(result ?? { ok: true });
      } catch (e) {
        next(e);
      }
    });
  function session(res, userId, bearer = false) {
    const token = randomBytes(32).toString('hex');
    run('INSERT INTO sessions VALUES(?,?,?)', digest(token), userId, Date.now() + 7 * 86400000);
    if (!bearer)
      res.setHeader(
        'Set-Cookie',
        serialize('roda', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 604800,
        }),
      );
    return token;
  }
  function loginResponse(req, res, user) {
    const bearer = req.headers['x-papotato-auth'] === 'bearer';
    const token = session(res, user.id, bearer);
    return { ...publicUser(user), ...(bearer ? { sessionToken: token } : {}) };
  }
  function member(space, user) {
    return (
      get('SELECT * FROM members WHERE space_id=? AND user_id=?', space, user) ||
      fail(403, 'Você não participa desta comunidade.')
    );
  }
  function admin(space, user) {
    const m = member(space, user);
    if (!['owner', 'admin'].includes(m.role)) fail(403, 'Apenas administradores.');
    return m;
  }
  function channelAccess(channel, user) {
    const c =
      get('SELECT * FROM channels WHERE id=?', channel) || fail(404, 'Canal não encontrado.');
    const m = member(c.space_id, user);
    if (
      get('SELECT 1 FROM direct_conversations WHERE space_id=?', c.space_id) &&
      get(
        "SELECT 1 FROM relationships r JOIN members m ON m.space_id=? WHERE r.state='blocked' AND ((r.sender=? AND r.recipient=m.user_id) OR (r.recipient=? AND r.sender=m.user_id))",
        c.space_id,
        user,
        user,
      )
    )
      fail(403, 'Conversa bloqueada.');
    if (
      c.private &&
      m.role === 'member' &&
      !get('SELECT 1 FROM channel_members WHERE channel_id=? AND user_id=?', channel, user)
    )
      fail(403, 'Canal privado.');
    return c;
  }
  const event = (channel, type, data, exclude) => {
    const room = 'channel:' + channel;
    for (const socketId of io?.sockets.adapter.rooms.get(room) || []) {
      if (socketId === exclude) continue;
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) continue;
      try {
        channelAccess(channel, socket.data.user.id);
        if (
          !get(
            'SELECT 1 FROM sessions WHERE hash=? AND expires>?',
            socket.data.user.session_hash,
            Date.now(),
          )
        ) {
          socket.disconnect();
          continue;
        }
        socket.emit(type, data);
      } catch {
        socket.leave(room);
      }
    }
  };
  const audit = (space, user, action) =>
    run('INSERT INTO audit VALUES(?,?,?,?,?)', id(), space, user, action, Date.now());
  async function disconnectMedia(uid) {
    if (!process.env.LIVEKIT_URL) return;
    const service = new RoomServiceClient(
      (process.env.LIVEKIT_INTERNAL_URL || process.env.LIVEKIT_URL).replace(/^ws/, 'http'),
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    );
    const voices = all(
      "SELECT c.id FROM channels c JOIN members m ON m.space_id=c.space_id WHERE m.user_id=? AND c.kind='voice'",
      uid,
    );
    for (const c of voices) {
      try {
        await service.removeParticipant(c.id, uid);
      } catch (e) {
        if (!/not found/i.test(e.message) && e.status !== 404 && e.code !== 'not_found')
          console.error('media_disconnect_failed', e.name);
      }
    }
  }
  app.use(
    '/api/auth',
    rateLimit({ windowMs: 900000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  route(
    'get',
    '/health',
    () => ({
      ok: true,
      app: 'papotato',
      version: '0.3.0',
      database: !!get('SELECT 1'),
      mediaConfigured: !!(
        process.env.LIVEKIT_URL &&
        process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET
      ),
      emailConfigured: false,
      costPolicy: COST_POLICY,
      limits: FREE_LIMITS,
    }),
    false,
  );
  route(
    'post',
    '/auth/register',
    (req, res) => {
      const b = z
        .object({
          email: z.email().max(254),
          username: z.string().regex(/^[a-z0-9_]{3,24}$/),
          display: text(60),
          password: z.string().min(12).max(128),
        })
        .parse(req.body);
      const salt = randomBytes(16).toString('hex'),
        uid = id();
      quota(
        get('SELECT count(*) AS n FROM users').n,
        FREE_LIMITS.users,
        'Esta instalação gratuita atingiu o limite de contas.',
      );
      if (
        get('SELECT id FROM users WHERE email=? OR username=?', b.email.toLowerCase(), b.username)
      )
        fail(409, 'E-mail ou usuário já cadastrado.');
      run(
        'INSERT INTO users(id,email,username,password,display,created) VALUES(?,?,?,?,?,?)',
        uid,
        b.email.toLowerCase(),
        b.username,
        salt + ':' + scryptSync(b.password, salt, 64).toString('hex'),
        b.display,
        Date.now(),
      );
      return loginResponse(req, res, get('SELECT * FROM users WHERE id=?', uid));
    },
    false,
  );
  route(
    'post',
    '/auth/login',
    (req, res) => {
      const b = z.object({ email: z.email(), password: z.string().max(128) }).parse(req.body);
      const u = get('SELECT * FROM users WHERE email=?', b.email.toLowerCase());
      const [salt, hash] = (u?.password || 'dummy:' + '00'.repeat(64)).split(':');
      if (!timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(b.password, salt, 64)) || !u)
        fail(401, 'E-mail ou senha incorretos.');
      return loginResponse(req, res, u);
    },
    false,
  );
  route('post', '/auth/logout', async (req, res) => {
    run('DELETE FROM sessions WHERE hash=?', req.user.session_hash);
    io?.to('session:' + req.user.session_hash).emit('session-revoked');
    io?.in('session:' + req.user.session_hash).disconnectSockets();
    res.setHeader('Set-Cookie', serialize('roda', '', { path: '/', maxAge: 0 }));
    await disconnectMedia(req.user.id);
  });
  route('post', '/auth/revoke', async (req) => {
    run('DELETE FROM sessions WHERE user_id=?', req.user.id);
    io?.to('user:' + req.user.id).emit('session-revoked');
    io?.in('user:' + req.user.id).disconnectSockets();
    await disconnectMedia(req.user.id);
  });
  route('get', '/me', (req) => publicUser(req.user));
  route('patch', '/me', (req) => {
    const b = z
      .object({
        display: text(60),
        bio: z.string().max(300),
        status: z.enum(['online', 'away', 'busy', 'invisible']),
        custom_status: z.string().max(80),
      })
      .parse(req.body);
    run(
      'UPDATE users SET display=?,bio=?,status=?,custom_status=? WHERE id=?',
      b.display,
      b.bio,
      b.status,
      b.custom_status,
      req.user.id,
    );
    return publicUser(get('SELECT * FROM users WHERE id=?', req.user.id));
  });
  route('get', '/spaces', (req) =>
    all(
      'SELECT s.*,m.role FROM spaces s JOIN members m ON m.space_id=s.id WHERE m.user_id=?',
      req.user.id,
    ),
  );
  route('post', '/spaces', (req) =>
    transaction(() => {
      quota(
        get('SELECT count(*) AS n FROM spaces').n,
        FREE_LIMITS.spaces,
        'Limite de comunidades e conversas privadas desta instalação gratuita atingido.',
      );
      const b = z
        .object({ name: text(60), description: z.string().max(300).default('') })
        .parse(req.body);
      const sid = id();
      run('INSERT INTO spaces VALUES(?,?,?,?)', sid, b.name, b.description, req.user.id);
      run('INSERT INTO members VALUES(?,?,?)', sid, req.user.id, 'owner');
      for (const [name, kind, pos] of [
        ['geral', 'text', 0],
        ['Sala de estar', 'voice', 1],
      ])
        run(
          'INSERT INTO channels(id,space_id,name,kind,position) VALUES(?,?,?,?,?)',
          id(),
          sid,
          name,
          kind,
          pos,
        );
      return { id: sid };
    }),
  );
  route('get', '/spaces/:id/channels', (req) => {
    member(req.params.id, req.user.id);
    return all(
      'SELECT c.*,(SELECT count(*) FROM messages msg WHERE msg.channel_id=c.id AND msg.seq>COALESCE((SELECT seq FROM reads WHERE user_id=? AND channel_id=c.id),0)) AS unread FROM channels c WHERE space_id=? ORDER BY position',
      req.user.id,
      req.params.id,
    ).filter((c) => {
      try {
        channelAccess(c.id, req.user.id);
        return true;
      } catch {
        return false;
      }
    });
  });
  route('post', '/spaces/:id/channels', (req) => {
    admin(req.params.id, req.user.id);
    quota(
      get('SELECT count(*) AS n FROM channels WHERE space_id=?', req.params.id).n,
      FREE_LIMITS.channelsPerSpace,
      'Limite de canais desta comunidade atingido.',
    );
    const b = z
      .object({
        name: text(60),
        kind: z.enum(['text', 'voice']),
        private: z.boolean().default(false),
        members: z.array(z.uuid()).max(100).default([]),
      })
      .parse(req.body);
    return transaction(() => {
      const cid = id();
      run(
        'INSERT INTO channels(id,space_id,name,kind,private,position) VALUES(?,?,?,?,?,?)',
        cid,
        req.params.id,
        b.name,
        b.kind,
        Number(b.private),
        Date.now(),
      );
      for (const uid of b.members) {
        member(req.params.id, uid);
        run('INSERT INTO channel_members VALUES(?,?)', cid, uid);
      }
      audit(req.params.id, req.user.id, 'Criou canal ' + b.name);
      return { id: cid };
    });
  });
  route('get', '/spaces/:id/members', (req) => {
    member(req.params.id, req.user.id);
    return all(
      'SELECT u.id,u.username,u.display,u.status,u.custom_status,m.role FROM users u JOIN members m ON m.user_id=u.id WHERE m.space_id=?',
      req.params.id,
    ).map((u) => ({
      ...u,
      status: u.status === 'invisible' ? 'offline' : u.status,
      connected: u.status !== 'invisible' && !!io?.sockets.adapter.rooms.get('user:' + u.id)?.size,
    }));
  });
  route('post', '/spaces/:id/invites', (req) => {
    admin(req.params.id, req.user.id);
    if (get('SELECT 1 FROM direct_conversations WHERE space_id=?', req.params.id))
      fail(403, 'Conversas privadas não aceitam convites.');
    const b = z
      .object({
        hours: z.number().int().min(1).max(168).default(24),
        uses: z.number().int().min(1).max(100).default(10),
      })
      .parse(req.body);
    const code = randomBytes(18).toString('base64url');
    run(
      'INSERT INTO invites(code,space_id,expires,max_uses) VALUES(?,?,?,?)',
      code,
      req.params.id,
      Date.now() + b.hours * 3600000,
      b.uses,
    );
    return { code, url: publicUrl + '?invite=' + code };
  });
  route('get', '/spaces/:id/invites', (req) => {
    admin(req.params.id, req.user.id);
    return all('SELECT * FROM invites WHERE space_id=?', req.params.id);
  });
  route('delete', '/invites/:code', (req) => {
    const i =
      get('SELECT * FROM invites WHERE code=?', req.params.code) ||
      fail(404, 'Convite inexistente.');
    admin(i.space_id, req.user.id);
    run('UPDATE invites SET revoked=1 WHERE code=?', i.code);
  });
  route('post', '/invites/:code/join', (req) =>
    transaction(() => {
      const i = get('SELECT * FROM invites WHERE code=?', req.params.code);
      if (!i || i.revoked || i.expires < Date.now() || i.uses >= i.max_uses)
        fail(410, 'Convite inválido, esgotado ou expirado.');
      if (get('SELECT 1 FROM bans WHERE space_id=? AND user_id=?', i.space_id, req.user.id))
        fail(403, 'Você foi banido.');
      if (!get('SELECT 1 FROM members WHERE space_id=? AND user_id=?', i.space_id, req.user.id)) {
        run('INSERT INTO members VALUES(?,?,?)', i.space_id, req.user.id, 'member');
        run('UPDATE invites SET uses=uses+1 WHERE code=?', i.code);
      }
      return { id: i.space_id };
    }),
  );
  route('get', '/channels/:id/messages', (req) => {
    channelAccess(req.params.id, req.user.id);
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const search = String(req.query.q || '').slice(0, 100);
    return all(
      'SELECT msg.*,u.display,u.username FROM messages msg JOIN users u ON u.id=msg.user_id WHERE channel_id=? AND seq<? AND body LIKE ? ORDER BY seq DESC LIMIT 50',
      req.params.id,
      before,
      '%' + search + '%',
    )
      .reverse()
      .map((m) => ({
        ...m,
        reactions: all(
          'SELECT emoji,count(*) AS count FROM reactions WHERE message_id=? GROUP BY emoji',
          m.id,
        ),
      }));
  });
  route('post', '/channels/:id/read', (req) => {
    channelAccess(req.params.id, req.user.id);
    run(
      'INSERT INTO reads VALUES(?,?,?) ON CONFLICT(user_id,channel_id) DO UPDATE SET seq=max(seq,excluded.seq)',
      req.user.id,
      req.params.id,
      get('SELECT COALESCE(max(seq),0) AS seq FROM messages WHERE channel_id=?', req.params.id).seq,
    );
  });
  route('post', '/channels/:id/messages', (req) => {
    const c = channelAccess(req.params.id, req.user.id);
    if (c.kind !== 'text') fail(400, 'Use um canal de texto.');
    const b = z
      .object({ id: z.uuid(), body: text(4000), reply_id: z.uuid().nullable().default(null) })
      .parse(req.body);
    const existing = get('SELECT * FROM messages WHERE id=?', b.id);
    if (existing) {
      if (existing.user_id !== req.user.id || existing.channel_id !== c.id)
        fail(409, 'Identificador em uso.');
      return existing;
    }
    quota(
      get('SELECT count(*) AS n FROM messages').n,
      FREE_LIMITS.messages,
      'O histórico atingiu o limite desta instalação gratuita. Nenhuma mensagem foi apagada.',
    );
    if (b.reply_id && !get('SELECT 1 FROM messages WHERE id=? AND channel_id=?', b.reply_id, c.id))
      fail(400, 'Resposta inválida.');
    if (
      get(
        'SELECT count(*) AS n FROM messages WHERE user_id=? AND created>?',
        req.user.id,
        Date.now() - 10000,
      ).n >= 10
    )
      fail(429, 'Espere um instante antes de enviar mais mensagens.');
    run(
      'INSERT INTO messages(id,channel_id,user_id,body,created,reply_id) VALUES(?,?,?,?,?,?)',
      b.id,
      c.id,
      req.user.id,
      b.body,
      Date.now(),
      b.reply_id,
    );
    const m = {
      ...get('SELECT * FROM messages WHERE id=?', b.id),
      display: req.user.display,
      username: req.user.username,
      reactions: [],
    };
    event(c.id, 'message', m);
    return m;
  });
  function messageAccess(req) {
    const m =
      get('SELECT * FROM messages WHERE id=?', req.params.id) ||
      fail(404, 'Mensagem não encontrada.');
    const c = channelAccess(m.channel_id, req.user.id);
    return { m, c };
  }
  route('patch', '/messages/:id', (req) => {
    const { m } = messageAccess(req);
    if (m.user_id !== req.user.id) fail(403, 'Só o autor pode editar.');
    const b = z.object({ body: text(4000) }).parse(req.body);
    run('UPDATE messages SET body=?,edited=? WHERE id=?', b.body, Date.now(), m.id);
    event(m.channel_id, 'refresh', {});
  });
  route('delete', '/messages/:id', (req) => {
    const { m, c } = messageAccess(req);
    if (m.user_id !== req.user.id) admin(c.space_id, req.user.id);
    run('UPDATE messages SET body=?,edited=? WHERE id=?', '_Mensagem excluída._', Date.now(), m.id);
    event(c.id, 'refresh', {});
  });
  route('post', '/messages/:id/pin', (req) => {
    const { m, c } = messageAccess(req);
    admin(c.space_id, req.user.id);
    run('UPDATE messages SET pinned=? WHERE id=?', m.pinned ? 0 : 1, m.id);
    event(c.id, 'refresh', {});
  });
  route('post', '/messages/:id/reactions', (req) => {
    const { m } = messageAccess(req);
    const { emoji } = z.object({ emoji: z.enum(['💚', '👍', '😂', '🎉']) }).parse(req.body);
    if (
      get(
        'SELECT 1 FROM reactions WHERE message_id=? AND user_id=? AND emoji=?',
        m.id,
        req.user.id,
        emoji,
      )
    )
      run(
        'DELETE FROM reactions WHERE message_id=? AND user_id=? AND emoji=?',
        m.id,
        req.user.id,
        emoji,
      );
    else run('INSERT INTO reactions VALUES(?,?,?)', m.id, req.user.id, emoji);
    event(m.channel_id, 'refresh', {});
  });
  route('get', '/friends', (req) =>
    all(
      'SELECT r.*,u.username,u.display FROM relationships r JOIN users u ON u.id=CASE WHEN r.sender=? THEN r.recipient ELSE r.sender END WHERE r.sender=? OR r.recipient=?',
      req.user.id,
      req.user.id,
      req.user.id,
    ),
  );
  route('post', '/direct', (req) =>
    transaction(() => {
      const b = z.object({ users: z.array(z.uuid()).min(1).max(7) }).parse(req.body);
      const ids = [...new Set([req.user.id, ...b.users])].sort();
      if (ids.length < 2) fail(400, 'Escolha um amigo.');
      for (const uid of ids.filter((x) => x !== req.user.id)) {
        if (
          !get(
            "SELECT 1 FROM relationships WHERE ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) AND state='accepted'",
            req.user.id,
            uid,
            uid,
            req.user.id,
          )
        )
          fail(403, 'Conversas privadas exigem amizade aceita.');
      }
      for (const sender of ids)
        for (const recipient of ids)
          if (
            get(
              "SELECT 1 FROM relationships WHERE sender=? AND recipient=? AND state='blocked'",
              sender,
              recipient,
            )
          )
            fail(403, 'Conversa indisponível.');
      const key = ids.join(',');
      const existing = get(
        'SELECT space_id FROM direct_conversations WHERE participant_key=?',
        key,
      );
      if (existing) return { id: existing.space_id };
      quota(
        get('SELECT count(*) AS n FROM spaces').n,
        FREE_LIMITS.spaces,
        'Limite de comunidades e conversas privadas desta instalação gratuita atingido.',
      );
      const sid = id(),
        names = ids
          .map((uid) => get('SELECT display FROM users WHERE id=?', uid).display)
          .join(', ')
          .slice(0, 100);
      run('INSERT INTO spaces VALUES(?,?,?,?)', sid, names, 'Conversa privada', req.user.id);
      run('INSERT INTO direct_conversations VALUES(?,?)', sid, key);
      for (const uid of ids)
        run(
          'INSERT INTO members VALUES(?,?,?)',
          sid,
          uid,
          uid === req.user.id ? 'owner' : 'member',
        );
      for (const [name, kind] of [
        ['conversa', 'text'],
        ['Chamada privada', 'voice'],
      ])
        run('INSERT INTO channels(id,space_id,name,kind) VALUES(?,?,?,?)', id(), sid, name, kind);
      return { id: sid };
    }),
  );
  route('post', '/spaces/:id/reports', (req) => {
    member(req.params.id, req.user.id);
    const b = z.object({ user: z.uuid(), reason: text(1000) }).parse(req.body);
    member(req.params.id, b.user);
    run(
      'INSERT INTO reports VALUES(?,?,?,?,?,?)',
      id(),
      req.user.id,
      b.user,
      req.params.id,
      b.reason,
      Date.now(),
    );
  });
  route('get', '/spaces/:id/reports', (req) => {
    admin(req.params.id, req.user.id);
    return all(
      'SELECT * FROM reports WHERE space_id=? ORDER BY created DESC LIMIT 100',
      req.params.id,
    );
  });
  app.post(
    '/api/channels/:id/files',
    auth,
    express.raw({ type: 'application/octet-stream', limit: FREE_LIMITS.uploadBytes }),
    (req, res, next) => {
      try {
        channelAccess(req.params.id, req.user.id);
        if (!Buffer.isBuffer(req.body) || !req.body.length) fail(400, 'Arquivo vazio.');
        const used = get(
          'SELECT COALESCE(sum(size),0) AS n FROM files WHERE user_id=?',
          req.user.id,
        ).n;
        if (used + req.body.length > FREE_LIMITS.uploadBytesPerUser)
          fail(
            413,
            'Limite gratuito de 16 MiB de arquivos por conta atingido. Exclua arquivos próprios para liberar espaço.',
          );
        if (
          get('SELECT COALESCE(sum(size),0) AS n FROM files').n + req.body.length >
          FREE_LIMITS.uploadBytesTotal
        )
          fail(413, 'Limite gratuito de 64 MiB de anexos da instalação atingido.');
        let name;
        try {
          name = decodeURIComponent(req.headers['x-file-name'] || 'arquivo');
        } catch {
          fail(400, 'Nome de arquivo inválido.');
        }
        name = name.replace(/[\x00-\x1f<>"/\\]/g, '_').slice(0, 150);
        const b = req.body;
        let mime = 'application/octet-stream';
        if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
          mime = 'image/png';
        else if (b[0] === 255 && b[1] === 216 && b[2] === 255) mime = 'image/jpeg';
        else if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
          mime = 'image/webp';
        else if (b.toString('ascii', 4, 8) === 'ftyp') mime = 'video/mp4';
        else if (b.toString('ascii', 0, 4) === 'OggS') mime = 'audio/ogg';
        else if (b.toString('ascii', 0, 3) === 'ID3') mime = 'audio/mpeg';
        else if (b.toString('ascii', 0, 5) === '%PDF-') mime = 'application/pdf';
        const fid = id();
        run(
          'INSERT INTO files VALUES(?,?,?,?,?,?,?,?)',
          fid,
          req.params.id,
          req.user.id,
          name,
          mime,
          b.length,
          b,
          Date.now(),
        );
        res.json({ id: fid, name, mime, url: '/api/files/' + fid });
      } catch (e) {
        next(e);
      }
    },
  );
  route('get', '/files/:id', (req, res) => {
    const f =
      get('SELECT * FROM files WHERE id=?', req.params.id) || fail(404, 'Arquivo inexistente.');
    channelAccess(f.channel_id, req.user.id);
    const period = currentPeriod();
    run("INSERT OR IGNORE INTO usage_counters VALUES('file-download-bytes',?,0)", period);
    const reserved = run(
      "UPDATE usage_counters SET value=value+? WHERE metric='file-download-bytes' AND period=? AND value+?<=?",
      f.size,
      period,
      f.size,
      FREE_LIMITS.downloadBytesPerMonth,
    );
    if (!reserved.changes)
      fail(
        429,
        'Cota mensal de downloads de anexos atingida. Ela reinicia no próximo mês UTC; nenhum plano será alterado pelo app.',
      );
    res.setHeader('Content-Type', f.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private,no-store');
    res.setHeader(
      'Content-Disposition',
      (f.mime.startsWith('image/') || f.mime.startsWith('audio/') || f.mime === 'video/mp4'
        ? 'inline'
        : 'attachment') +
        "; filename*=UTF-8''" +
        encodeURIComponent(f.name),
    );
    res.send(Buffer.from(f.content));
  });
  route('get', '/usage', (req) => ({
    costPolicy: COST_POLICY,
    limits: FREE_LIMITS,
    period: currentPeriod(),
    storage: {
      userBytes: get('SELECT COALESCE(sum(size),0) AS n FROM files WHERE user_id=?', req.user.id).n,
      totalBytes: get('SELECT COALESCE(sum(size),0) AS n FROM files').n,
    },
    downloadBytes:
      get(
        "SELECT value FROM usage_counters WHERE metric='file-download-bytes' AND period=?",
        currentPeriod(),
      )?.value || 0,
    files: all(
      'SELECT id,name,size,created FROM files WHERE user_id=? ORDER BY created DESC',
      req.user.id,
    ),
  }));
  route('delete', '/files/:id', (req) => {
    const f =
      get('SELECT * FROM files WHERE id=?', req.params.id) || fail(404, 'Arquivo inexistente.');
    // The uploader can reclaim their quota even after leaving or being banned from a space.
    if (f.user_id !== req.user.id) {
      const c = channelAccess(f.channel_id, req.user.id);
      admin(c.space_id, req.user.id);
    }
    run('DELETE FROM files WHERE id=?', f.id);
  });
  route('post', '/friends', (req) => {
    const { username } = z.object({ username: text(24) }).parse(req.body);
    const u =
      get('SELECT id FROM users WHERE username=?', username) ||
      fail(404, 'Usuário não encontrado.');
    if (u.id === req.user.id) fail(400, 'Escolha outra pessoa.');
    if (
      get(
        "SELECT 1 FROM relationships WHERE ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) AND state='blocked'",
        u.id,
        req.user.id,
        req.user.id,
        u.id,
      )
    )
      fail(403, 'Solicitação indisponível.');
    if (
      get(
        'SELECT 1 FROM relationships WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',
        u.id,
        req.user.id,
        req.user.id,
        u.id,
      )
    )
      fail(409, 'Já existe uma solicitação ou amizade.');
    run('INSERT INTO relationships VALUES(?,?,?)', req.user.id, u.id, 'pending');
  });
  route('patch', '/friends/:id', (req) => {
    const { action } = z.object({ action: z.enum(['accept', 'remove', 'block']) }).parse(req.body);
    if (action === 'accept')
      run(
        "UPDATE relationships SET state='accepted' WHERE sender=? AND recipient=? AND state='pending'",
        req.params.id,
        req.user.id,
      );
    else {
      transaction(() => {
        run(
          'DELETE FROM relationships WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',
          req.user.id,
          req.params.id,
          req.params.id,
          req.user.id,
        );
        if (action === 'block')
          run('INSERT INTO relationships VALUES(?,?,?)', req.user.id, req.params.id, 'blocked');
      });
    }
  });
  route('get', '/spaces/:id/audit', (req) => {
    admin(req.params.id, req.user.id);
    return all(
      'SELECT * FROM audit WHERE space_id=? ORDER BY created DESC LIMIT 100',
      req.params.id,
    );
  });
  route('get', '/spaces/:id/bans', (req) => {
    admin(req.params.id, req.user.id);
    return all(
      'SELECT b.user_id,u.display FROM bans b JOIN users u ON u.id=b.user_id WHERE b.space_id=?',
      req.params.id,
    );
  });
  route('post', '/spaces/:id/moderate', async (req) => {
    const actor = admin(req.params.id, req.user.id);
    const b = z
      .object({
        user: z.uuid(),
        action: z.enum(['kick', 'ban', 'unban', 'admin', 'member', 'transfer']),
        confirmation: z.string().optional(),
      })
      .parse(req.body);
    const s = get('SELECT * FROM spaces WHERE id=?', req.params.id);
    if (b.user === req.user.id || b.user === s.owner)
      fail(403, 'Esta ação não pode ser aplicada ao proprietário ou a você.');
    if (['transfer', 'admin', 'member'].includes(b.action) && actor.role !== 'owner')
      fail(403, 'Apenas o proprietário pode alterar cargos.');
    if (b.action === 'transfer' && b.confirmation !== s.name)
      fail(400, 'Confirme digitando o nome da comunidade.');
    const target = b.action === 'unban' ? null : member(s.id, b.user);
    if (target?.role === 'admin' && actor.role !== 'owner')
      fail(403, 'Somente o proprietário pode moderar administradores.');
    if (['kick', 'ban'].includes(b.action)) {
      const voices = all("SELECT id FROM channels WHERE space_id=? AND kind='voice'", s.id);
      if (process.env.LIVEKIT_URL) {
        const service = new RoomServiceClient(
          (process.env.LIVEKIT_INTERNAL_URL || process.env.LIVEKIT_URL).replace(/^ws/, 'http'),
          process.env.LIVEKIT_API_KEY,
          process.env.LIVEKIT_API_SECRET,
        );
        for (const c of voices) {
          try {
            await service.removeParticipant(c.id, b.user);
          } catch (e) {
            if (!/not found/i.test(e.message) && e.status !== 404 && e.code !== 'not_found')
              fail(503, 'Não foi possível remover a mídia. Tente novamente.');
          }
        }
      }
    }
    transaction(() => {
      if (b.action === 'unban')
        run('DELETE FROM bans WHERE space_id=? AND user_id=?', s.id, b.user);
      else if (b.action === 'transfer') {
        run('UPDATE spaces SET owner=? WHERE id=?', b.user, s.id);
        run("UPDATE members SET role='admin' WHERE space_id=? AND user_id=?", s.id, req.user.id);
        run("UPDATE members SET role='owner' WHERE space_id=? AND user_id=?", s.id, b.user);
      } else if (['admin', 'member'].includes(b.action))
        run('UPDATE members SET role=? WHERE space_id=? AND user_id=?', b.action, s.id, b.user);
      else {
        run('DELETE FROM members WHERE space_id=? AND user_id=?', s.id, b.user);
        if (b.action === 'ban') run('INSERT OR IGNORE INTO bans VALUES(?,?)', s.id, b.user);
        for (const c of all('SELECT id FROM channels WHERE space_id=?', s.id))
          io?.in('user:' + b.user).socketsLeave('channel:' + c.id);
      }
      audit(s.id, req.user.id, b.action + ':' + b.user);
    });
  });
  route('post', '/channels/:id/token', async (req) => {
    const c = channelAccess(req.params.id, req.user.id);
    if (c.kind !== 'voice') fail(400, 'Canal não é de voz.');
    if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_SECRET || !process.env.LIVEKIT_API_KEY)
      fail(
        503,
        'Mídia não configurada. Configure LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET no servidor.',
      );
    const service = new RoomServiceClient(
      (process.env.LIVEKIT_INTERNAL_URL || process.env.LIVEKIT_URL).replace(/^ws/, 'http'),
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    );
    try {
      await service.createRoom({
        name: c.id,
        maxParticipants: FREE_LIMITS.participantsPerCall,
        emptyTimeout: 300,
      });
    } catch (e) {
      if (e.code === 'resource_exhausted' || /quota|limit.*exceed/i.test(e.message))
        fail(
          429,
          'A franquia ou capacidade do serviço gratuito de mídia foi atingida. Verifique o painel Build; não há upgrade automático pelo Papotato.',
        );
      fail(503, 'Não foi possível alcançar o serviço de mídia. Nenhuma chamada foi simulada.');
    }
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: req.user.id,
      name: req.user.display,
      ttl: '5m',
    });
    token.addGrant({
      roomJoin: true,
      room: c.id,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
    return { token: await token.toJwt(), url: process.env.LIVEKIT_URL, limits: FREE_LIMITS };
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Operação não encontrada.' }));
  app.use((err, req, res, next) => {
    if (!req.path.startsWith('/api')) return next(err);
    const full = err.errcode === 13 || /database or disk is full/i.test(err.message);
    const status = full ? 507 : err instanceof z.ZodError ? 400 : err.status || 500;
    if (status === 500) console.error('request_failed', req.method, req.path, err.name);
    res.status(status).json({
      error: full
        ? 'O armazenamento gratuito da instalação atingiu o limite. Faça backup e libere anexos; os dados existentes foram preservados.'
        : status === 500
          ? 'Não foi possível concluir. Verifique o servidor.'
          : err instanceof z.ZodError
            ? 'Verifique os campos informados.'
            : err.type === 'entity.too.large'
              ? 'O limite por arquivo é 2 MiB.'
              : err.message,
    });
  });
  function attach(server) {
    io = new Server(server, {
      cors: { origin: allowedOrigin, credentials: false },
      maxHttpBufferSize: 8192,
    });
    io.use((socket, next) => {
      if (socket.handshake.headers.origin && socket.handshake.headers.origin !== allowedOrigin)
        return next(new Error('Origem inválida.'));
      const authToken = socket.handshake.auth?.token;
      const u = authenticate(
        socket.handshake.headers.cookie,
        typeof authToken === 'string'
          ? 'Bearer ' + authToken
          : socket.handshake.headers.authorization,
      );
      if (!u) return next(new Error('Sessão inválida.'));
      socket.data.user = u;
      next();
    });
    io.on('connection', (socket) => {
      const u = socket.data.user;
      socket.join('user:' + u.id);
      socket.join('session:' + u.session_hash);
      let lastTyping = 0;
      const valid = () =>
        !!get('SELECT 1 FROM sessions WHERE hash=? AND expires>?', u.session_hash, Date.now());
      socket.on('watch', (cid, ack) => {
        try {
          if (!valid()) fail(401, 'Sessão expirada.');
          channelAccess(cid, u.id);
          for (const room of socket.rooms) if (room.startsWith('channel:')) socket.leave(room);
          socket.join('channel:' + cid);
          ack?.({ ok: true });
        } catch {
          ack?.({ error: 'Acesso negado.' });
        }
      });
      socket.on('typing', (cid) => {
        if (Date.now() - lastTyping < 2000) return;
        lastTyping = Date.now();
        try {
          if (!valid()) return socket.disconnect();
          channelAccess(cid, u.id);
          event(cid, 'typing', { channel: cid, display: u.display }, socket.id);
        } catch {}
      });
    });
    const interval = setInterval(() => {
      for (const socket of io.sockets.sockets.values())
        if (
          !get(
            'SELECT 1 FROM sessions WHERE hash=? AND expires>?',
            socket.data.user.session_hash,
            Date.now(),
          )
        )
          socket.disconnect();
    }, 30000);
    interval.unref();
    io.on('close', () => clearInterval(interval));
    return io;
  }
  return { app, db, attach };
}
