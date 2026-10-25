import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FREE_LIMITS } from './limits.js';
export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(resolve(directory, 'roda.sqlite'));
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA wal_autocheckpoint=256; PRAGMA journal_size_limit=8388608;',
  );
  const pageSize = db.prepare('PRAGMA page_size').get().page_size;
  db.exec(`PRAGMA max_page_count=${Math.floor(FREE_LIMITS.databaseBytes / pageSize)};`);
  db.exec(readFileSync(new URL('./migration.sql', import.meta.url), 'utf8'));
  return db;
}
