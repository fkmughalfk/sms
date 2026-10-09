import { z } from 'zod';
import { dec } from '../calc/decimal';

/** Record id (Prisma cuid). */
export const idSchema = z.string().trim().min(1);

/** Optional foreign key: '' / null / undefined → null. */
export const optionalIdSchema = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

/** Master names: trimmed, required (CLAUDE.md rule 8; uniqueness is case-insensitive in the DB). */
export const nameSchema = (max = 120) =>
  z.string({ error: 'Enter a name.' }).trim().min(1, 'Enter a name.').max(max);

/** Optional free text: trimmed, '' / null / undefined → null. */
export const optionalTextSchema = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Business date `YYYY-MM-DD` (CLAUDE.md rule 9). */
export const dateStringSchema = (message = 'Enter a valid date.') => z.iso.date({ error: message });

/** `YYYY-MM` month. */
export const monthStringSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Enter a valid month.');

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export interface DecimalOptions {
  /** Max digits after the point (matches the Prisma column scale). */
  maxDecimals: number;
  min?: number;
  /** When true, `min` itself is not allowed (i.e. value must be > min). */
  exclusiveMin?: boolean;
  max?: number;
  message?: string;
}

/**
 * Decimal value sent as a string or number; output is a canonical decimal string
 * (e.g. "16250", "0.0035") so it can go straight into decimal.js / Prisma.Decimal.
 * Never produces a JS float (CLAUDE.md rule 1).
 */
export const decimalSchema = ({ maxDecimals, min, exclusiveMin, max, message }: DecimalOptions) => {
  const error = message ?? 'Enter a valid number.';
  return z
    .union([z.string(), z.number()], { error })
    .transform((v) => String(v).trim())
    .superRefine((s, ctx) => {
      if (!DECIMAL_RE.test(s)) {
        ctx.addIssue({ code: 'custom', message: error });
        return;
      }
      if ((s.split('.')[1]?.length ?? 0) > maxDecimals) {
        ctx.addIssue({
          code: 'custom',
          message: message ?? `Use at most ${maxDecimals} decimal places.`,
        });
        return;
      }
      const n = dec(s);
      const tooLow = min !== undefined && (exclusiveMin ? n.lte(min) : n.lt(min));
      const tooHigh = max !== undefined && n.gt(max);
      if (tooLow || tooHigh) ctx.addIssue({ code: 'custom', message: error });
    })
    .transform(canonicalDecimal);
};

/** "016250.50" → "16250.5", "-0.0" → "0". */
function canonicalDecimal(s: string): string {
  const negative = s.startsWith('-');
  let [int = '0', frac = ''] = (negative ? s.slice(1) : s).split('.');
  int = int.replace(/^0+(?=\d)/, '');
  frac = frac.replace(/0+$/, '');
  const out = frac ? `${int}.${frac}` : int;
  return negative && out !== '0' ? `-${out}` : out;
}

/** Commission rate as a fraction (0.0035 = 0.35%), Decimal(8,6). */
export const commissionRateSchema = decimalSchema({
  maxDecimals: 6,
  min: 0,
  max: 1,
  message: 'Enter a commission rate between 0 and 1 (e.g. 0.0035 for 0.35%).',
});

/** Activate / deactivate a master or user (`PATCH /x/:id/status`). */
export const statusSchema = z.object({ isActive: z.boolean() });
export type StatusInput = z.infer<typeof statusSchema>;

/** Query-string boolean: 'true' | 'false'. */
export const booleanQuerySchema = z.enum(['true', 'false']).transform((v) => v === 'true');

/** `?page=1&pageSize=50&sort=invoiceDate:desc` (spec §7). */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  sort: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9.]*:(asc|desc)$/, 'Use sort=field:asc or field:desc.')
    .optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Master list filters: `?search=&active=true|false` (omit `active` for all). */
export const masterListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  active: booleanQuerySchema.optional(),
});
export type MasterListQuery = z.infer<typeof masterListQuerySchema>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/** Response schema for a paginated list of `item`. */
export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
  });

/** Error body returned by the API exception filter (spec §7). */
export interface ApiError {
  statusCode: number;
  message: string;
  errors?: { path: string; message: string }[];
}
