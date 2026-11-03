import neo4j from 'neo4j-driver';
export function graphDriver() {
  const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = process.env;
  if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) throw new Error('Neo4j configuration missing');
  return neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
}
export async function accessibleRoute(from: string, to: string) {
  const d = graphDriver(),
    s = d.session();
  try {
    // Bounded simple-path enumeration; appropriate for the supplied small campus graph, not city scale.
    const result = await s.run(
      `MATCH (a:Location {node_id:$from}),(b:Location {node_id:$to})
 MATCH p=(a)-[:CONNECTS_TO*0..12]-(b)
 WHERE all(n IN nodes(p) WHERE n.is_accessible=true) AND all(r IN relationships(p) WHERE r.is_accessible=true)
 WITH p,reduce(m=0.0,r IN relationships(p)|m+r.distance_m) AS meters
 RETURN [n IN nodes(p)|{node_id:n.node_id,name:n.name}] AS steps,meters ORDER BY meters LIMIT 1`,
      { from, to },
    );
    if (!result.records.length) return null;
    return { steps: result.records[0].get('steps'), meters: result.records[0].get('meters') };
  } finally {
    await s.close();
    await d.close();
  }
}
