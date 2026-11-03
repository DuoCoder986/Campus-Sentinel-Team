import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { pool } from './db';
export type Actor = { user_id: string; name: string; email: string; roles: string[] };
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return new TextEncoder().encode(s);
}
export async function signSession(id: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret());
}
export async function actor(req: NextRequest): Promise<Actor> {
  const token = req.cookies.get('campus_session')?.value;
  if (!token) throw new HttpError(401, 'Sign in to continue');
  let id: string | undefined;
  try {
    id = (await jwtVerify(token, secret(), { algorithms: ['HS256'] })).payload.sub;
  } catch {
    throw new HttpError(401, 'Session expired. Sign in again');
  }
  const { rows } = await pool().query(
    `SELECT u.user_id,u.name,u.email,coalesce(array_agg(r.role_name) FILTER(WHERE r.role_name IS NOT NULL),'{}') AS roles FROM "user" u LEFT JOIN user_role ur USING(user_id) LEFT JOIN role r USING(role_id) WHERE u.user_id=$1 AND u.is_active GROUP BY u.user_id`,
    [id],
  );
  if (!rows[0]) throw new HttpError(401, 'Account inactive');
  return rows[0];
}
export function requireRole(a: Actor, ...roles: string[]) {
  if (!roles.some((r) => a.roles.includes(r)))
    throw new HttpError(403, 'Your role cannot perform this action');
}
export function checkOrigin(req: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const expected = process.env.APP_ORIGIN;
  if (!expected) throw new Error('APP_ORIGIN is required');
  if (req.headers.get('origin') !== expected) throw new HttpError(403, 'Request origin rejected');
}
// Process-local throttling is suitable for one-node course demos only; see security notes.
const attempts = new Map<string, { n: number; until: number }>();
export function throttle(email: string) {
  const now = Date.now();
  if (attempts.size > 10000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const v = attempts.get(email);
  if (v && v.until > now && v.n >= 8)
    throw new HttpError(429, 'Too many attempts. Wait 15 minutes');
  attempts.set(email, {
    n: v && v.until > now ? v.n + 1 : 1,
    until: v && v.until > now ? v.until : now + 900000,
  });
}

export function clearThrottle(email: string) {
  attempts.delete(email);
}
