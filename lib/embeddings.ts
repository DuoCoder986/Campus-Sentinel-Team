export const MODEL = process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
export async function embed(texts: string[]): Promise<number[][]> {
  const response = await fetch(`${process.env.EMBEDDING_URL || 'http://localhost:8000'}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error('Embedding service unavailable');
  const data = await response.json();
  if (
    data.model !== MODEL ||
    !Array.isArray(data.vectors) ||
    data.vectors.length !== texts.length ||
    data.vectors.some(
      (v: unknown) =>
        !Array.isArray(v) ||
        v.length !== 384 ||
        v.some((x) => typeof x !== 'number' || !Number.isFinite(x)),
    )
  )
    throw new Error('Embedding model/dimension mismatch');
  return data.vectors;
}
export function vector(v: number[]) {
  if (v.length !== 384 || v.some((x) => !Number.isFinite(x))) throw new Error('Invalid embedding');
  return `[${v.join(',')}]`;
}
