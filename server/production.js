// Compose local profile: static serving with development-only HTTP session cookies.
import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createApp } from './app.js';
const { app, attach, db } = createApp();
app.use(express.static(resolve('dist')));
app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
const server = createServer(app);
const io = attach(server);
server.listen(3000, '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    io.close();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
