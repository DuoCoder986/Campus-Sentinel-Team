import './env';
import { readFileSync } from 'node:fs';
import { pool } from '../lib/db';
import { graphDriver } from '../lib/graph';
async function main() {
  const d = graphDriver(),
    s = d.session();
  try {
    await s.run(
      'CREATE CONSTRAINT location_node_id IF NOT EXISTS FOR (l:Location) REQUIRE l.node_id IS UNIQUE',
    );
    await s.run(
      'CREATE CONSTRAINT building_code IF NOT EXISTS FOR (b:Building) REQUIRE b.code IS UNIQUE',
    );
    const buildings = await pool().query('SELECT * FROM building'),
      locations = await pool().query(
        'SELECT l.*,b.building_code FROM location l JOIN building b USING(building_id)',
      );
    const links = JSON.parse(readFileSync('graph/connections.json', 'utf8'));
    const ids = new Set(locations.rows.map((l) => l.neo4j_node_id));
    for (const link of links)
      if (!ids.has(link.from) || !ids.has(link.to) || link.distance_m < 0)
        throw new Error('Invalid graph connection fixture');
    await s.executeWrite(async (tx) => {
      for (const b of buildings.rows)
        await tx.run('MERGE (b:Building {code:$code}) SET b.name=$name', {
          code: b.building_code,
          name: b.building_name,
        });
      for (const l of locations.rows)
        await tx.run(
          'MATCH (b:Building {code:$building}) MERGE (l:Location {node_id:$id}) SET l.name=$name,l.floor=$floor,l.is_accessible=$accessible MERGE (b)-[:CONTAINS]->(l)',
          {
            building: l.building_code,
            id: l.neo4j_node_id,
            name: l.location_name,
            floor: l.floor_number,
            accessible: l.is_accessible,
          },
        );
      // Replace only relationships managed by this demo sync, never unrelated graph data.
      await tx.run("MATCH ()-[r:CONNECTS_TO {source:'campus-seed'}]->() DELETE r");
      for (const l of links)
        await tx.run(
          "MATCH (a:Location {node_id:$from}),(b:Location {node_id:$to}) MERGE (a)-[r:CONNECTS_TO {source:'campus-seed'}]->(b) SET r.distance_m=$distance_m,r.is_accessible=$is_accessible",
          l,
        );
    });
    console.log('Graph synced. SQL remains the source of location identity.');
  } finally {
    await s.close();
    await d.close();
    await pool().end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
