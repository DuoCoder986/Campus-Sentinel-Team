import './env';
import { pool } from '../lib/db';
import { embed, MODEL, vector } from '../lib/embeddings';
async function main() {
  let n = 0;
  while (true) {
    const r = await pool().query(
      'SELECT r.report_id,r.report_text FROM incident_report r LEFT JOIN report_embedding e USING(report_id) WHERE e.report_id IS NULL LIMIT 25',
    );
    if (!r.rows.length) break;
    const vectors = await embed(r.rows.map((x) => x.report_text));
    for (let i = 0; i < r.rows.length; i++) {
      await pool().query(
        'INSERT INTO report_embedding(report_id,embedding,model_name,model_version) VALUES($1,$2::vector,$3,1) ON CONFLICT(report_id) DO NOTHING',
        [r.rows[i].report_id, vector(vectors[i]), MODEL],
      );
      n++;
    }
  }
  console.log('Backfilled', n, 'reports');
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
