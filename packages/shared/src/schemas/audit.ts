import { z } from 'zod';
import { AUDIT_ACTIONS } from '../enums';
import { dateStringSchema, paginatedSchema, paginationQuerySchema } from './common';

/** Entities that write audit entries (spec §5.9). */
export const AUDIT_ENTITIES = [
  'Invoice',
  'Payment',
  'User',
  'Product',
  'Category',
  'Party',
  'SubParty',
  'City',
  'Salesperson',
  'Bank',
  'Setting',
  'Import',
] as const;

/** `GET /audit` — filter by user, entity, action and date (spec §5.9). */
export const auditQuerySchema = paginationQuerySchema.extend({
  userId: z.string().trim().min(1).optional(),
  entity: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  from: dateStringSchema().optional(),
  to: dateStringSchema().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  action: z.enum(AUDIT_ACTIONS),
  entity: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditListSchema = paginatedSchema(auditEntrySchema);

/** Field-level differences between two audit snapshots, for the before/after view. */
export function auditDiff(
  before: unknown,
  after: unknown,
): { field: string; before: unknown; after: unknown }[] {
  const obj = (v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const b = obj(before);
  const a = obj(after);
  const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return fields
    .filter((f) => JSON.stringify(b[f]) !== JSON.stringify(a[f]))
    .map((field) => ({ field, before: b[field], after: a[field] }));
}
