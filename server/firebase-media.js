import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AccessToken } from 'livekit-server-sdk';
import { pathToFileURL } from 'node:url';

const jwks = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);
export function createFirebaseMediaApp(config, dependencies = {}) {
  const { projectId, livekitUrl, apiKey, apiSecret } = config;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origin !== 'papotato://app')
      return res.status(403).json({ error: 'Origem não autorizada.' });
    if (origin) res.set('Access-Control-Allow-Origin', origin).set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.get('/health', (_req, res) =>
    res
      .status(projectId && livekitUrl && apiKey && apiSecret ? 200 : 503)
      .json({ ready: !!(projectId && livekitUrl && apiKey && apiSecret) }),
  );
  app.use(express.json({ limit: '2kb' }));
  app.use(
    '/token',
    rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  const verify =
    dependencies.verify ||
    (async (token) =>
      (
        await jwtVerify(token, jwks, {
          issuer: 'https://securetoken.google.com/' + projectId,
          audience: projectId,
          algorithms: ['RS256'],
        })
      ).payload);
  const read =
    dependencies.read ||
    (async (path, token) => {
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`,
        { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok)
        throw Object.assign(new Error('Sem acesso ao canal.'), {
          status: response.status === 403 || response.status === 404 ? 403 : 503,
        });
      return (await response.json()).fields;
    });
  app.post('/token', async (req, res) => {
    try {
      if (!projectId || !livekitUrl || !apiKey || !apiSecret)
        return res.status(503).json({ error: 'Chamadas ainda não configuradas no servidor.' });
      const raw = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
      if (!raw) return res.status(401).json({ error: 'Entre na sua conta.' });
      let identity;
      try {
        identity = await verify(raw);
      } catch {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }
      if (!identity.sub || !/^[a-zA-Z0-9_-]{1,128}$/.test(identity.sub))
        return res.status(401).json({ error: 'Identidade inválida.' });
      const cid = req.body?.channelId;
      if (typeof cid !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(cid))
        return res.status(400).json({ error: 'Canal inválido.' });
      // The user's own ID token is used: Firestore rules enforce bans, private ACLs and revocation.
      const channel = await read('channels/' + cid, raw);
      if (channel.kind?.stringValue !== 'voice')
        return res.status(400).json({ error: 'Escolha um canal de voz.' });
      const profile = await read('profiles/' + identity.sub, raw);
      const token = new AccessToken(apiKey, apiSecret, {
        identity: identity.sub,
        name: profile.display?.stringValue || 'Papotato',
        ttl: '5m',
      });
      token.addGrant({
        roomJoin: true,
        room: `firebase-${projectId}-${cid}`,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
      res.json({
        token: await token.toJwt(),
        url: livekitUrl,
        limits: {
          participantsPerCall: null,
          cameraHeight: 720,
          cameraFrameRate: 30,
          cameraBitrate: 1500000,
          screenFrameRate: 30,
          screenBitrate: 4000000,
        },
      });
    } catch (error) {
      res
        .status(error.status || 503)
        .json({
          error:
            error.status === 403
              ? 'Você não tem acesso a esta chamada.'
              : 'Serviço de chamadas indisponível. Tente novamente.',
        });
    }
  });
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: 'Requisição inválida.' }),
  );
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createFirebaseMediaApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
    livekitUrl: process.env.LIVEKIT_URL,
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
  }).listen(Number(process.env.PORT || 3001), '0.0.0.0', () =>
    console.log('Papotato Firebase media broker iniciado.'),
  );
}
