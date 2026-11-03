import './env';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pool } from '../lib/db';
async function main() {
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(872310)');
    await c.query(
      'CREATE TABLE IF NOT EXISTS schema_migration(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const name of readdirSync('db')
      .filter((n) => /^\d+.*\.sql$/.test(n))
      .sort()) {
      const sql = readFileSync('db/' + name, 'utf8'),
        checksum = createHash('sha256').update(sql).digest('hex');
      const r = await c.query('SELECT checksum FROM schema_migration WHERE name=$1', [name]);
      if (r.rows[0]) {
        if (r.rows[0].checksum !== checksum) throw new Error('Applied migration changed: ' + name);
        continue;
      }
      await c.query(sql);
      await c.query('INSERT INTO schema_migration(name,checksum) VALUES($1,$2)', [name, checksum]);
      console.log('Applied', name);
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
    await pool().end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
