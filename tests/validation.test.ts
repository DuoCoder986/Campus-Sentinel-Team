import test from 'node:test';
import assert from 'node:assert/strict';
import { reportSchema, chunkText, priority, loginSchema } from '../lib/validation';
import { vector } from '../lib/embeddings';
const valid = {
  title: 'Leaking pipe',
  description: 'A leaking pipe near the lab entrance.',
  location_id: 1,
  category_id: 1,
  severity: 'HIGH',
};
test('report validates and rejects malformed fields', () => {
  assert.equal(reportSchema.parse(valid).severity, 'HIGH');
  for (const bad of [
    { title: 'a' },
    { location_id: -1 },
    { latitude: 91, longitude: 2 },
    { latitude: 12 },
    { evidence_url: 'javascript:alert(1)' },
    { severity: 'URGENT' },
  ])
    assert.equal(reportSchema.safeParse({ ...valid, ...bad }).success, false);
});
test('email normalized', () =>
  assert.equal(
    loginSchema.parse({ email: 'Person@Campus.test', password: 'x' }).email,
    'person@campus.test',
  ));
test('chunk overlap retains content and terminates at boundary', () => {
  assert.equal(chunkText('a'.repeat(900)).length, 1);
  const c = chunkText('a'.repeat(1800));
  assert.equal(c.length, 3);
  assert.equal(c[0].length, 900);
  assert.equal(c[1].length, 900);
  assert.equal(c[2].length, 240);
  assert.equal(chunkText('abc')[0], 'abc');
});
test('priority clamps report and age bonuses', () => {
  assert.equal(priority('HIGH', 1, 0), 60);
  assert.equal(priority('CRITICAL', 100, 10000), 100);
  assert.equal(priority('LOW', 0, -5), 20);
});
test('vector enforces fixed dimension and finite values', () => {
  assert.equal(vector(Array(384).fill(0)).startsWith('['), true);
  assert.throws(() => vector([1, 2]));
  assert.throws(() => vector(Array(384).fill(NaN)));
});
