import pg from 'pg';
const globalDb = globalThis as unknown as { campusPool?: pg.Pool };
export function pool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return (globalDb.campusPool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
  }));
}
export async function transaction<T>(
  actor: string,
  reason: string,
  work: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    await c.query(
      "SELECT set_config('app.actor_id',$1,true),set_config('app.change_reason',$2,true)",
      [actor, reason],
    );
    const value = await work(c);
    await c.query('COMMIT');
    return value;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
