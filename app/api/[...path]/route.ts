import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { ZodError, z } from 'zod';
import { pool, transaction } from '@/lib/db';
import {
  actor,
  checkOrigin,
  HttpError,
  requireRole,
  signSession,
  throttle,
  clearThrottle,
  Actor,
} from '@/lib/auth';
import {
  loginSchema,
  reportSchema,
  statusSchema,
  updateSchema,
  uuid,
  sopSchema,
  chunkText,
} from '@/lib/validation';
import { embed, MODEL, vector } from '@/lib/embeddings';
import { accessibleRoute } from '@/lib/graph';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
async function body(req: NextRequest) {
  if (Number(req.headers.get('content-length') || 0) > 65536)
    throw new HttpError(413, 'Request too large');
  const text = await req.text();
  if (text.length > 65536) throw new HttpError(413, 'Request too large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}
async function canWork(a: Actor, id: string) {
  if (a.roles.includes('ADMIN')) return;
  requireRole(a, 'STAFF');
  const { rowCount } = await pool().query(
    "SELECT 1 FROM assignment WHERE incident_id=$1 AND assigned_staff_id=$2 AND assignment_status IN ('PENDING','ACCEPTED')",
    [id, a.user_id],
  );
  if (!rowCount) throw new HttpError(403, 'Only assigned staff may update this incident');
}
async function route(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    checkOrigin(req);
    const p = (await ctx.params).path;
    const resource = p[0],
      id = p[1],
      action = p[2],
      method = req.method;
    if (resource === 'auth' && id === 'login' && method === 'POST') {
      const { email, password } = loginSchema.parse(await body(req));
      throttle(email);
      const { rows } = await pool().query(
        'SELECT user_id,password_hash,is_active FROM "user" WHERE email=$1',
        [email],
      );
      // Fixed valid dummy hash equalizes absent-account bcrypt cost. Not an account credential.
      const valid = await bcrypt.compare(
        password,
        rows[0]?.password_hash || '$2b$12$P7Y4G7U4QLvBvof9V3hU0.DtFZQfAY0cwL4bTr3n81zZL2ywrQKOi',
      );
      if (!rows[0]?.is_active || !valid) throw new HttpError(401, 'Invalid email or password');
      clearThrottle(email);
      const response = json({ ok: true });
      response.cookies.set('campus_session', await signSession(rows[0].user_id), {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.COOKIE_SECURE === 'true',
        path: '/',
        maxAge: 28800,
      });
      return response;
    }
    if (resource === 'auth' && id === 'logout' && method === 'POST') {
      const response = json({ ok: true });
      response.cookies.set('campus_session', '', {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.COOKIE_SECURE === 'true',
        path: '/',
        maxAge: 0,
      });
      return response;
    }
    const a = await actor(req);
    if (resource === 'auth' && id === 'me' && method === 'GET') return json(a);
    if (resource === 'catalogue' && method === 'GET') {
      const [locations, categories, staff] = await Promise.all([
        pool().query(
          'SELECT l.*,b.building_name FROM location l JOIN building b USING(building_id) ORDER BY b.building_name,l.floor_number,l.location_name',
        ),
        pool().query('SELECT * FROM incident_category WHERE is_active ORDER BY category_name'),
        a.roles.includes('ADMIN')
          ? pool().query(
              `SELECT u.user_id,u.name FROM "user" u JOIN user_role ur USING(user_id) JOIN role r USING(role_id) WHERE r.role_name='STAFF' AND u.is_active ORDER BY u.name`,
            )
          : Promise.resolve({ rows: [] }),
      ]);
      return json({ locations: locations.rows, categories: categories.rows, staff: staff.rows });
    }
    if (resource === 'incidents' && !id && method === 'GET') {
      const status = req.nextUrl.searchParams.get('status') || '',
        q = req.nextUrl.searchParams.get('q') || '',
        mine = req.nextUrl.searchParams.get('mine') === 'true';
      if (q.length > 200) throw new HttpError(400, 'Search too long');
      const { rows } = await pool().query(
        `SELECT d.* FROM incident_dashboard d WHERE ($1='' OR d.status=$1) AND ($2='' OR to_tsvector('english',d.title||' '||d.description) @@ plainto_tsquery('english',$2)) AND (NOT $3::boolean OR EXISTS(SELECT 1 FROM incident_report r WHERE r.incident_id=d.incident_id AND r.reporter_id=$4) OR EXISTS(SELECT 1 FROM assignment x WHERE x.incident_id=d.incident_id AND x.assigned_staff_id=$4 AND x.assignment_status IN ('PENDING','ACCEPTED'))) ORDER BY d.live_priority DESC,d.created_at DESC LIMIT 200`,
        [status, q, mine, a.user_id],
      );
      return json(rows);
    }
    if (resource === 'dashboard' && method === 'GET') {
      const [counts, categories] = await Promise.all([
        pool().query(
          `SELECT count(*) FILTER(WHERE status NOT IN ('CLOSED','RESOLVED','REJECTED')) AS open_count,count(*) FILTER(WHERE severity='CRITICAL' AND status NOT IN ('CLOSED','RESOLVED','REJECTED')) AS critical_count,count(*) FILTER(WHERE sla_state='BREACHED' AND status NOT IN ('CLOSED','RESOLVED','REJECTED')) AS breached_count,count(*) FILTER(WHERE status IN ('RESOLVED','CLOSED')) AS resolved_count FROM incident_dashboard`,
        ),
        pool().query(
          `SELECT category_name,count(*) AS total,round(avg(extract(epoch FROM resolved_at-created_at)/3600)::numeric,2) AS average_resolution_hours FROM incident_dashboard GROUP BY category_name ORDER BY total DESC`,
        ),
      ]);
      return json({ counts: counts.rows[0], categories: categories.rows });
    }
    if (resource === 'incidents' && id && method === 'GET') {
      uuid.parse(id);
      const { rows } = await pool().query('SELECT * FROM incident_dashboard WHERE incident_id=$1', [
        id,
      ]);
      if (!rows[0]) throw new HttpError(404, 'Incident not found');
      const privileged = a.roles.includes('ADMIN') || a.roles.includes('STAFF');
      const [reports, updates, history, assignments] = await Promise.all([
        pool().query(
          'SELECT report_id,report_text,evidence_url,reported_at,reporter_id FROM incident_report WHERE incident_id=$1 AND ($2::boolean OR reporter_id=$3) ORDER BY reported_at',
          [id, privileged, a.user_id],
        ),
        pool().query(
          'SELECT x.*,u.name AS author_name FROM incident_update x JOIN "user" u ON x.author_id=u.user_id WHERE incident_id=$1 ORDER BY created_at',
          [id],
        ),
        pool().query(
          'SELECT old_status,new_status,change_reason,changed_at FROM status_history WHERE incident_id=$1 ORDER BY changed_at,history_id',
          [id],
        ),
        pool().query(
          'SELECT x.*,u.name AS staff_name FROM assignment x JOIN "user" u ON x.assigned_staff_id=u.user_id WHERE incident_id=$1 ORDER BY assigned_at DESC',
          [id],
        ),
      ]);
      return json({
        ...rows[0],
        reports: reports.rows,
        updates: updates.rows,
        history: history.rows,
        assignments: assignments.rows,
      });
    }
    if (resource === 'reports' && !id && method === 'POST') {
      const v = reportSchema.parse(await body(req));
      let ev: number[];
      try {
        [ev] = await embed([v.description]);
      } catch {
        throw new HttpError(
          503,
          'Semantic service unavailable; no report was saved. Start the embedding service and retry.',
        );
      }
      const saved = await transaction(a.user_id, 'Initial incident report', async (c) => {
        // A global xact advisory lock serializes report creation; deterministic race-free demo deduplication.
        await c.query('SELECT pg_advisory_xact_lock(872311)');
        const { rows: cat } = await c.query(
          'SELECT 1 FROM incident_category WHERE category_id=$1 AND is_active',
          [v.category_id],
        );
        if (!cat[0]) throw new HttpError(400, 'Inactive or unknown category');
        let incidentId = v.incident_id;
        if (incidentId) {
          const { rows } = await c.query(
            "SELECT 1 FROM incident WHERE incident_id=$1 AND category_id=$2 AND location_id=$3 AND status NOT IN ('RESOLVED','CLOSED','REJECTED') FOR UPDATE",
            [incidentId, v.category_id, v.location_id],
          );
          if (!rows[0])
            throw new HttpError(
              409,
              'Selected incident is no longer open at this location/category',
            );
        } else {
          // Threshold is a candidate heuristic, not proof of duplication. Never auto-merge.
          const candidates = await c.query(
            `SELECT i.incident_id,i.title,1-(e.embedding <=> $1::vector) AS similarity FROM report_embedding e JOIN incident_report r USING(report_id) JOIN incident i USING(incident_id) WHERE i.location_id=$2 AND i.category_id=$3 AND i.status NOT IN ('RESOLVED','CLOSED','REJECTED') AND e.model_name=$4 AND 1-(e.embedding <=> $1::vector)>=0.85 ORDER BY e.embedding <=> $1::vector LIMIT 1`,
            [vector(ev), v.location_id, v.category_id, MODEL],
          );
          if (candidates.rows[0])
            throw new HttpError(
              409,
              `Possible duplicate found. Review incident ${candidates.rows[0].incident_id} and select “Attach to existing” or adjust the report to describe a distinct issue.`,
            );
          const { rows } = await c.query(
            'INSERT INTO incident(location_id,category_id,title,description,severity) VALUES($1,$2,$3,$4,$5) RETURNING incident_id',
            [v.location_id, v.category_id, v.title, v.description, v.severity],
          );
          incidentId = rows[0].incident_id;
        }
        const { rows } = await c.query(
          'INSERT INTO incident_report(incident_id,reporter_id,report_text,evidence_url,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6) RETURNING report_id',
          [
            incidentId,
            a.user_id,
            v.description,
            v.evidence_url,
            v.latitude ?? null,
            v.longitude ?? null,
          ],
        );
        await c.query(
          'INSERT INTO report_embedding(report_id,embedding,model_name,model_version) VALUES($1,$2::vector,$3,1)',
          [rows[0].report_id, vector(ev), MODEL],
        );
        await c.query(
          'UPDATE incident SET priority_score=calculate_priority(severity,(SELECT count(*) FROM incident_report WHERE incident_id=$1),extract(epoch FROM now()-created_at)/60) WHERE incident_id=$1',
          [incidentId],
        );
        return { incident_id: incidentId, report_id: rows[0].report_id };
      });
      return json(saved, 201);
    }
    if (resource === 'reports' && id && method === 'DELETE') {
      uuid.parse(id);
      await transaction(a.user_id, 'Report withdrawn', async (c) => {
        const { rows } = await c.query('SELECT * FROM incident_report WHERE report_id=$1', [id]);
        const r = rows[0];
        if (!r) throw new HttpError(404, 'Report not found');
        if (r.reporter_id !== a.user_id && !a.roles.includes('ADMIN'))
          throw new HttpError(403, 'Only the reporter or admin can withdraw a report');
        await c.query('SELECT 1 FROM incident WHERE incident_id=$1 FOR UPDATE', [r.incident_id]);
        const result = await c.query(
          'SELECT count(*)::int AS n FROM incident_report WHERE incident_id=$1',
          [r.incident_id],
        );
        if (result.rows[0].n <= 1)
          throw new HttpError(409, 'Cannot delete the last report of an incident');
        await c.query('DELETE FROM incident_report WHERE report_id=$1', [id]);
        await c.query(
          'UPDATE incident SET priority_score=calculate_priority(severity,(SELECT count(*) FROM incident_report WHERE incident_id=$1),extract(epoch FROM now()-created_at)/60) WHERE incident_id=$1',
          [r.incident_id],
        );
      });
      return json({ ok: true });
    }
    if (resource === 'incidents' && id && action === 'status' && method === 'PATCH') {
      requireRole(a, 'ADMIN');
      uuid.parse(id);
      const v = statusSchema.parse(await body(req));
      await transaction(a.user_id, v.reason, async (c) => {
        const r = await c.query(
          'UPDATE incident SET status=$2 WHERE incident_id=$1 RETURNING incident_id',
          [id, v.status],
        );
        if (!r.rowCount) throw new HttpError(404, 'Incident not found');
      });
      return json({ ok: true });
    }
    if (resource === 'incidents' && id && action === 'assign' && method === 'POST') {
      requireRole(a, 'ADMIN');
      uuid.parse(id);
      const v = z.object({ staff_id: uuid }).parse(await body(req));
      await transaction(a.user_id, 'Administrator assigned staff', async (c) => {
        const { rows } = await c.query(
          'SELECT status FROM incident WHERE incident_id=$1 FOR UPDATE',
          [id],
        );
        if (rows[0]?.status !== 'VERIFIED')
          throw new HttpError(409, 'Verify the incident before assignment');
        await c.query(
          'INSERT INTO assignment(incident_id,assigned_staff_id,assigned_by) VALUES($1,$2,$3)',
          [id, v.staff_id, a.user_id],
        );
        await c.query("UPDATE incident SET status='ASSIGNED' WHERE incident_id=$1", [id]);
      });
      return json({ ok: true }, 201);
    }
    if (resource === 'assignments' && id && method === 'PATCH') {
      requireRole(a, 'STAFF');
      uuid.parse(id);
      const v = z.object({ action: z.enum(['accept', 'complete']) }).parse(await body(req));
      await transaction(
        a.user_id,
        v.action === 'accept' ? 'Staff accepted assignment' : 'Staff completed assignment',
        async (c) => {
          // Lock order is always incident, then assignment, including concurrent requests.
          const first = await c.query('SELECT incident_id FROM assignment WHERE assignment_id=$1', [
            id,
          ]);
          if (!first.rows[0]) throw new HttpError(404, 'Assignment not found');
          await c.query('SELECT 1 FROM incident WHERE incident_id=$1 FOR UPDATE', [
            first.rows[0].incident_id,
          ]);
          const { rows } = await c.query(
            'SELECT * FROM assignment WHERE assignment_id=$1 FOR UPDATE',
            [id],
          );
          const row = rows[0];
          if (row.assigned_staff_id !== a.user_id) throw new HttpError(403, 'Not your assignment');
          if (v.action === 'accept') {
            if (row.assignment_status !== 'PENDING')
              throw new HttpError(409, 'Assignment is not pending');
            await c.query(
              "UPDATE assignment SET assignment_status='ACCEPTED',accepted_at=now() WHERE assignment_id=$1",
              [id],
            );
            await c.query("UPDATE incident SET status='IN_PROGRESS' WHERE incident_id=$1", [
              row.incident_id,
            ]);
          } else {
            if (row.assignment_status !== 'ACCEPTED')
              throw new HttpError(409, 'Accept this assignment first');
            await c.query(
              "UPDATE assignment SET assignment_status='COMPLETED',completed_at=now() WHERE assignment_id=$1",
              [id],
            );
            await c.query("UPDATE incident SET status='RESOLVED' WHERE incident_id=$1", [
              row.incident_id,
            ]);
          }
        },
      );
      return json({ ok: true });
    }
    if (resource === 'incidents' && id && action === 'updates' && method === 'POST') {
      uuid.parse(id);
      await canWork(a, id);
      const v = updateSchema.parse(await body(req));
      const r = await pool().query(
        'INSERT INTO incident_update(incident_id,author_id,update_message,evidence_url) VALUES($1,$2,$3,$4) RETURNING update_id',
        [id, a.user_id, v.message, v.evidence_url],
      );
      return json(r.rows[0], 201);
    }
    if (resource === 'search' && method === 'POST') {
      const v = z
        .object({
          query: z.string().trim().min(3).max(1000),
          kind: z.enum(['incidents', 'sops']),
          location_id: z.number().int().positive().optional(),
          category_id: z.number().int().positive().optional(),
        })
        .parse(await body(req));
      let e: number[];
      try {
        [e] = await embed([v.query]);
      } catch {
        throw new HttpError(503, 'Embedding service unavailable');
      }
      if (v.kind === 'sops') {
        const { rows } = await pool().query(
          `SELECT c.chunk_id,c.chunk_content,d.document_id,d.document_title,d.source_url,1-(c.embedding <=> $1::vector) AS similarity FROM sop_chunk c JOIN sop_document d USING(document_id) WHERE d.is_verified AND c.embedding_model=$2 AND ($3::int IS NULL OR d.category_id=$3) ORDER BY c.embedding <=> $1::vector LIMIT 8`,
          [vector(e), MODEL, v.category_id ?? null],
        );
        return json(rows);
      }
      const { rows } = await pool().query(
        `SELECT DISTINCT ON (incident_id) incident_id,title,location_name,status,similarity FROM (SELECT i.incident_id,i.title,l.location_name,i.status,1-(e.embedding <=> $1::vector) AS similarity FROM report_embedding e JOIN incident_report r USING(report_id) JOIN incident i USING(incident_id) JOIN location l USING(location_id) WHERE e.model_name=$2 AND ($3::int IS NULL OR i.location_id=$3) AND ($4::int IS NULL OR i.category_id=$4)) q ORDER BY incident_id,similarity DESC`,
        [vector(e), MODEL, v.location_id ?? null, v.category_id ?? null],
      );
      return json(rows.sort((x, y) => y.similarity - x.similarity).slice(0, 8));
    }
    if (resource === 'sops' && !id && method === 'GET') {
      const r = await pool().query(
        `SELECT d.document_id,d.document_title,d.source_url,d.document_version,d.is_verified,c.category_name,(SELECT count(*) FROM sop_chunk x WHERE x.document_id=d.document_id) AS chunks FROM sop_document d JOIN incident_category c USING(category_id) WHERE ($1::boolean OR d.is_verified) ORDER BY d.created_at DESC`,
        [a.roles.includes('ADMIN')],
      );
      return json(r.rows);
    }
    if (resource === 'sops' && !id && method === 'POST') {
      requireRole(a, 'ADMIN');
      const v = sopSchema.parse(await body(req));
      const chunks = chunkText(v.content);
      let vectors: number[][];
      try {
        vectors = await embed(chunks);
      } catch {
        throw new HttpError(503, 'Embedding service unavailable; no document saved');
      }
      const r = await transaction(a.user_id, 'SOP import', async (c) => {
        const result = await c.query(
          'INSERT INTO sop_document(category_id,document_title,source_url,document_version,is_verified) VALUES($1,$2,$3,$4,$5) RETURNING document_id',
          [v.category_id, v.title, v.source_url, v.version, v.is_verified],
        );
        const did = result.rows[0].document_id;
        for (let n = 0; n < chunks.length; n++)
          await c.query(
            'INSERT INTO sop_chunk(document_id,chunk_content,chunk_number,embedding,embedding_model) VALUES($1,$2,$3,$4::vector,$5)',
            [did, chunks[n], n + 1, vector(vectors[n]), MODEL],
          );
        return { document_id: did };
      });
      return json(r, 201);
    }
    if (resource === 'sops' && id && method === 'DELETE') {
      requireRole(a, 'ADMIN');
      uuid.parse(id);
      const r = await pool().query(
        'DELETE FROM sop_document WHERE document_id=$1 AND NOT is_verified RETURNING document_id',
        [id],
      );
      if (!r.rowCount) throw new HttpError(409, 'Only unverified draft SOPs can be deleted');
      return json({ ok: true });
    }
    if (resource === 'routes' && method === 'GET') {
      const from = z.string().min(1).max(100).parse(req.nextUrl.searchParams.get('from')),
        to = z.string().min(1).max(100).parse(req.nextUrl.searchParams.get('to'));
      try {
        const r = await accessibleRoute(from, to);
        if (!r) throw new HttpError(404, 'No accessible route within 12 segments');
        return json(r);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(503, 'Neo4j unavailable. Start Neo4j and run graph:sync.');
      }
    }
    throw new HttpError(404, 'API route not found');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof ZodError)
      return json(
        { error: e.issues.map((x) => `${x.path.join('.') || 'input'}: ${x.message}`).join('; ') },
        400,
      );
    const err = e as { code?: string; message?: string };
    if (err.code === '23505')
      return json({ error: 'This record or active assignment already exists' }, 409);
    if (err.code === '23503' || err.code === '23514' || err.code === '22P02')
      return json(
        { error: 'Database integrity check failed. Check the referenced IDs and field values.' },
        400,
      );
    if (err.code === 'P0001')
      return json({ error: err.message || 'Database rule rejected the operation' }, 409);
    console.error('API request failed', err.code || 'INTERNAL', err.message);
    return json(
      { error: 'Service unavailable. Check database configuration and server logs.' },
      503,
    );
  }
}
export { route as GET, route as POST, route as PATCH, route as DELETE };
