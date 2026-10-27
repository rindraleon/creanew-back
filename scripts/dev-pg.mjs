import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';

const dir = '/home/user/.cache/pgdata';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'mobilier',
  password: 'mobilier',
  port: 55432,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});
await pg.initialise();
await pg.start();
try { await pg.createDatabase('mobilier_shop'); } catch (e) { console.log('db:', e.message); }
console.log('PG_READY on port 55432');
