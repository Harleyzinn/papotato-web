import { createServer } from 'node:http';
import express from 'express';
import { resolve } from 'node:path';
import { createApp } from './app.js';
const { app, attach, db } = createApp();
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = createServer(app);
const io = attach(server);
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Papotato: http://localhost:${port}`));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    io.close();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
