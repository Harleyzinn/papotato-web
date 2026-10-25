import { DatabaseSync, backup } from 'node:sqlite';
import { resolve } from 'node:path';
const destination = process.argv[2];
if (!destination) throw new Error('Uso: node scripts/backup.mjs caminho/backup.sqlite');
const db = new DatabaseSync(resolve(process.env.DATA_DIR || 'data', 'roda.sqlite'));
await backup(db, resolve(destination));
db.close();
console.log('Backup consistente criado. Inclui anexos.');
