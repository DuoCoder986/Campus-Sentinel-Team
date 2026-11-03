import { z } from 'zod';
export const uuid = z.string().uuid();
export const severity = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const evidence = z
  .union([
    z
      .string()
      .url()
      .max(2048)
      .refine((v) => /^https?:\/\//.test(v), 'Use an http(s) URL'),
    z.literal(''),
  ])
  .optional()
  .transform((v) => v || null);
export const reportSchema = z
  .object({
    title: z.string().trim().min(5).max(180),
    description: z.string().trim().min(10).max(10000),
    location_id: z.coerce.number().int().positive(),
    category_id: z.coerce.number().int().positive(),
    severity,
    evidence_url: evidence,
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    incident_id: uuid.optional(),
  })
  .refine(
    (v) => (v.latitude == null) === (v.longitude == null),
    'Provide both coordinates or neither',
  );
export const statusSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED', 'CLOSED']),
  reason: z.string().trim().min(3).max(1000),
});
export const updateSchema = z.object({
  message: z.string().trim().min(3).max(5000),
  evidence_url: evidence,
});
export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const sopSchema = z.object({
  category_id: z.coerce.number().int().positive(),
  title: z.string().trim().min(5).max(180),
  source_url: z
    .string()
    .url()
    .max(2048)
    .refine((v) => /^https?:\/\//.test(v)),
  version: z.coerce.number().int().positive(),
  content: z.string().trim().min(30).max(30000),
  is_verified: z.boolean(),
});
export function chunkText(text: string, size = 900, overlap = 120) {
  const result: string[] = [];
  for (let at = 0; at < text.length; at += size - overlap) {
    result.push(text.slice(at, at + size));
    if (at + size >= text.length) break;
  }
  return result;
}
export function priority(sev: string, reports: number, age: number) {
  return (
    ({ LOW: 20, MEDIUM: 40, HIGH: 60, CRITICAL: 80 }[sev] ?? 20) +
    Math.min(15, Math.max(0, reports - 1) * 3) +
    Math.min(5, Math.max(0, age) / 60)
  );
}
