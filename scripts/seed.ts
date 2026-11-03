import './env';
import bcrypt from 'bcryptjs';
import { pool, transaction } from '../lib/db';
import { embed, MODEL, vector } from '../lib/embeddings';
const ADMIN = '10000000-0000-4000-8000-000000000001',
  STAFF = '10000000-0000-4000-8000-000000000002',
  REPORTER = '10000000-0000-4000-8000-000000000003';
const samples = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    title: 'Water leak near the lab entrance',
    text: 'Water is pooling outside the ground floor laboratory entrance. The walkway is slippery and students are walking around the puddle.',
    location: 2,
    category: 1,
    severity: 'HIGH',
    state: 'ASSIGNED',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    title: 'Corridor lighting is not working',
    text: 'Several lights in the first floor corridor are flickering and the far end of the hallway is dark.',
    location: 3,
    category: 2,
    severity: 'MEDIUM',
    state: 'REPORTED',
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    title: 'Lift access blocked by stored boxes',
    text: 'Stacked delivery boxes are blocking the approach to the library lift. Wheelchair users cannot reach the lift entrance.',
    location: 5,
    category: 3,
    severity: 'HIGH',
    state: 'VERIFIED',
  },
  {
    id: '20000000-0000-4000-8000-000000000004',
    title: 'Library reading room network outage',
    text: 'The wireless network in the library reading room is unavailable on multiple devices. Other floors seem unaffected.',
    location: 6,
    category: 4,
    severity: 'LOW',
    state: 'RESOLVED',
  },
];
const docs = [
  {
    category: 1,
    title: '[DEMO] Facility leak reporting procedure',
    text: 'COURSEWORK EXAMPLE ONLY. Record the location and visible impact of a reported water leak. Notify the authorized facilities team through the incident system. Add progress notes and an evidence URL if permitted. The assigned staff member records completion and an administrator confirms closure. This is not an approved safety or emergency procedure.',
  },
  {
    category: 3,
    title: '[DEMO] Accessibility obstruction workflow',
    text: 'COURSEWORK EXAMPLE ONLY. Report the exact location of an accessibility obstruction. Describe whether a doorway, lift approach or ramp is affected. Notify the responsible campus staff. Use the accessible-route view only as a demonstration of graph traversal, not as live navigation advice. Document the outcome before closing the incident.',
  },
];
async function main() {
  const passwords = [
    process.env.SEED_ADMIN_PASSWORD,
    process.env.SEED_STAFF_PASSWORD,
    process.env.SEED_REPORTER_PASSWORD,
  ];
  if (passwords.some((p) => !p || p.length < 12))
    throw new Error(
      'Set all three SEED_*_PASSWORD variables to distinct values of at least 12 characters',
    );
  if (new Set(passwords).size !== 3) throw new Error('Use distinct demo account passwords');
  const hashes = await Promise.all(passwords.map((p) => bcrypt.hash(p!, 12)));
  const vectors = await embed([...samples.map((s) => s.text), ...docs.map((d) => d.text)]);
  await transaction(ADMIN, 'Demo seed', async (c) => {
    for (const [n, r] of ['ADMIN', 'STAFF', 'REPORTER'].entries())
      await c.query(
        'INSERT INTO role(role_id,role_name,description) VALUES($1,$2,$3) ON CONFLICT(role_id) DO NOTHING',
        [n + 1, r, r + ' project role'],
      );
    for (const [n, id] of [ADMIN, STAFF, REPORTER].entries()) {
      await c.query(
        'INSERT INTO "user"(user_id,name,email,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash',
        [
          id,
          ['Aditi Rao', 'Rohan Kumar', 'Student Reporter'][n],
          ['admin@campus.test', 'staff@campus.test', 'reporter@campus.test'][n],
          hashes[n],
        ],
      );
      await c.query('INSERT INTO user_role(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [
        id,
        n + 1,
      ]);
    }
    for (const b of [
      [1, 'SCI', 'Science Block'],
      [2, 'LIB', 'Central Library'],
    ])
      await c.query(
        'INSERT INTO building(building_id,building_code,building_name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        b,
      );
    const locs = [
      [1, 1, 'Main Entrance', 0, 'ENTRANCE', 'SCI-ENTRY', true],
      [2, 1, 'Ground Floor Lab', 0, 'LAB', 'SCI-LAB', true],
      [3, 1, 'First Floor Corridor', 1, 'CORRIDOR', 'SCI-F1', true],
      [4, 2, 'Library Entrance', 0, 'ENTRANCE', 'LIB-ENTRY', true],
      [5, 2, 'Lift Lobby', 0, 'LIFT', 'LIB-LIFT', true],
      [6, 2, 'Reading Room', 1, 'ROOM', 'LIB-READ', true],
      [7, 1, 'Stair Landing', 1, 'STAIRS', 'SCI-STAIR', false],
    ];
    for (const l of locs)
      await c.query(
        'INSERT INTO location(location_id,building_id,location_name,floor_number,location_type,neo4j_node_id,is_accessible) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
        l,
      );
    for (const cat of [
      [1, 'Plumbing', 3, 'PLUMBING'],
      [2, 'Electrical', 3, 'ELECTRICAL'],
      [3, 'Accessibility', 3, 'FACILITIES'],
      [4, 'IT Services', 2, 'NETWORKING'],
    ]) {
      await c.query(
        'INSERT INTO incident_category(category_id,category_name,base_severity,required_skill) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        cat,
      );
      for (const [n, s] of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].entries())
        await c.query(
          'INSERT INTO sla_policy(category_id,severity_level,response_minutes,resolution_minutes) VALUES($1,$2,$3,$4) ON CONFLICT(category_id,severity_level) DO NOTHING',
          [cat[0], s, [240, 120, 30, 10][n], [2880, 1440, 240, 60][n]],
        );
    }
    for (let n = 0; n < samples.length; n++) {
      const s = samples[n];
      if ((await c.query('SELECT 1 FROM incident WHERE incident_id=$1', [s.id])).rowCount) continue;
      await c.query(
        "INSERT INTO incident(incident_id,title,description,location_id,category_id,severity,created_at) VALUES($1,$2,$3,$4,$5,$6,now()-interval '3 hours')",
        [s.id, s.title, s.text, s.location, s.category, s.severity],
      );
      const r = await c.query(
        "INSERT INTO incident_report(incident_id,reporter_id,report_text,reported_at) VALUES($1,$2,$3,now()-interval '3 hours') RETURNING report_id",
        [s.id, REPORTER, s.text],
      );
      await c.query(
        'INSERT INTO report_embedding(report_id,embedding,model_name,model_version) VALUES($1,$2::vector,$3,1)',
        [r.rows[0].report_id, vector(vectors[n]), MODEL],
      );
      if (s.state !== 'REPORTED')
        await c.query("UPDATE incident SET status='VERIFIED' WHERE incident_id=$1", [s.id]);
      if (['ASSIGNED', 'RESOLVED'].includes(s.state)) {
        await c.query(
          'INSERT INTO assignment(incident_id,assigned_staff_id,assigned_by) VALUES($1,$2,$3)',
          [s.id, STAFF, ADMIN],
        );
        await c.query("UPDATE incident SET status='ASSIGNED' WHERE incident_id=$1", [s.id]);
      }
      if (s.state === 'RESOLVED') {
        await c.query(
          "UPDATE assignment SET assignment_status='ACCEPTED',accepted_at=now() WHERE incident_id=$1",
          [s.id],
        );
        await c.query("UPDATE incident SET status='IN_PROGRESS' WHERE incident_id=$1", [s.id]);
        await c.query(
          "UPDATE assignment SET assignment_status='COMPLETED',completed_at=now() WHERE incident_id=$1",
          [s.id],
        );
        await c.query("UPDATE incident SET status='RESOLVED' WHERE incident_id=$1", [s.id]);
      }
      await c.query(
        'UPDATE incident SET priority_score=calculate_priority(severity,1,180) WHERE incident_id=$1',
        [s.id],
      );
    }
    for (let n = 0; n < docs.length; n++) {
      const d = docs[n];
      if ((await c.query('SELECT 1 FROM sop_document WHERE document_title=$1', [d.title])).rowCount)
        continue;
      const r = await c.query(
        'INSERT INTO sop_document(category_id,document_title,source_url,document_version,is_verified) VALUES($1,$2,$3,1,true) RETURNING document_id',
        [d.category, d.title, 'https://example.com/coursework-demo-sop'],
      );
      await c.query(
        'INSERT INTO sop_chunk(document_id,chunk_content,chunk_number,embedding,embedding_model) VALUES($1,$2,1,$3::vector,$4)',
        [r.rows[0].document_id, d.text, vector(vectors[samples.length + n]), MODEL],
      );
    }
    for (const table of ['role', 'building', 'location', 'incident_category', 'sla_policy'])
      await c.query(
        `SELECT setval(pg_get_serial_sequence('${table}','${table === 'incident_category' ? 'category_id' : table === 'role' ? 'role_id' : table + '_id'}'),(SELECT max(${table === 'incident_category' ? 'category_id' : table === 'role' ? 'role_id' : table + '_id'}) FROM ${table}))`,
      );
  });
  console.log(
    'Seed complete: admin@campus.test, staff@campus.test, reporter@campus.test. Passwords are from your environment.',
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
