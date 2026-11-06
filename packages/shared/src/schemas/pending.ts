import { z } from 'zod';
import { RATE_BASES } from '../calc/rates';

// Pending orders report and the opening import (docs/ORDERS_DELIVERY_SPEC.md §7, phase O3).

/**
 * How names from other software are matched: trimmed, single spaces, upper case.
 * "Farhan  sb " → "FARHAN SB". Aliases are stored and looked up in this form.
 */
export function normalizeAlias(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toUpperCase();
}

// ── Report ──

const optionalFilterId = z.string().trim().min(1).optional();

export const pendingReportQuerySchema = z.object({
  partyId: optionalFilterId,
  cityId: optionalFilterId,
  salespersonId: optionalFilterId,
  productId: optionalFilterId,
  cropYear: z.string().trim().min(1).optional(),
});
export type PendingReportQuery = z.infer<typeof pendingReportQuerySchema>;

const ref = z.object({ id: z.string(), name: z.string() });

export const pendingTotalsSchema = z.object({
  pendingPacks: z.number(),
  pendingWeightKg: z.string(),
  pendingAmount: z.string(),
});
export type PendingTotals = z.infer<typeof pendingTotalsSchema>;

export const pendingReportLineSchema = z.object({
  orderId: z.string(),
  orderNo: z.number(),
  orderDate: z.string(),
  party: ref,
  subParty: ref.nullable(),
  salesperson: ref.nullable(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
  }),
  /** Snapshots from the order line: "25 kg" or "4 × 10 kg". */
  packWeightKg: z.string(),
  packPcs: z.number(),
  cropYear: z.string().nullable(),
  qtyPacks: z.number(),
  weightKg: z.string(),
  basis: z.enum(RATE_BASES),
  rate: z.string(),
  dispatchedPacks: z.number(),
  pendingPacks: z.number(),
  pendingWeightKg: z.string(),
  pendingAmount: z.string(),
});
export type PendingReportLine = z.infer<typeof pendingReportLineSchema>;

export const pendingReportSchema = z.object({
  /** Today, Asia/Karachi. */
  date: z.string(),
  /** Highest order number in the system (the report header's "LAST ORDER NO"). */
  lastOrderNo: z.number().nullable(),
  groups: z.array(
    z.object({
      city: z.string(),
      lines: z.array(pendingReportLineSchema),
      totals: pendingTotalsSchema,
    }),
  ),
  totals: pendingTotalsSchema,
});
export type PendingReport = z.infer<typeof pendingReportSchema>;

// ── Opening import (go-live) ──

/** A name in the file the system doesn't know yet, and what to do with it. */
export const openingMappingSchema = z.object({
  /** Key `NAME|kg` (e.g. "1121 STEAM|25") → product id. */
  products: z.record(z.string(), z.string().trim().min(1)).default({}),
  /** Key NAME → existing party id, or create a party with that name. */
  parties: z
    .record(
      z.string(),
      z.discriminatedUnion('action', [
        z.object({ action: z.literal('map'), partyId: z.string().trim().min(1) }),
        z.object({ action: z.literal('create') }),
      ]),
    )
    .default({}),
  /** Key NAME → existing salesperson, a new one, or none. */
  salespersons: z
    .record(
      z.string(),
      z.discriminatedUnion('action', [
        z.object({ action: z.literal('map'), salespersonId: z.string().trim().min(1) }),
        z.object({ action: z.literal('create') }),
        z.object({ action: z.literal('none') }),
      ]),
    )
    .default({}),
});
export type OpeningMapping = z.infer<typeof openingMappingSchema>;

export const openingImportReportSchema = z.object({
  dryRun: z.boolean(),
  /** Nothing blocks the import: every name is decided and every row could be read. */
  ready: z.boolean(),
  summary: z.object({
    rows: z.number(),
    orders: z.object({ create: z.number(), exists: z.number(), lines: z.number() }),
    cities: z.object({ create: z.number() }),
    parties: z.object({ create: z.number() }),
    salespersons: z.object({ create: z.number() }),
  }),
  /** Rows that can't be imported as they are. */
  problems: z.array(z.object({ row: z.number(), message: z.string() })),
  /** Names to decide, with the system's guess. */
  unmatched: z.object({
    products: z.array(
      z.object({
        key: z.string(),
        text: z.string(),
        kg: z.string(),
        rows: z.number(),
        suggestion: ref.nullable(),
        mapping: z.string().nullable(),
      }),
    ),
    parties: z.array(
      z.object({
        key: z.string(),
        text: z.string(),
        rows: z.number(),
        suggestion: ref.nullable(),
        mapping: z.string().nullable(),
      }),
    ),
    salespersons: z.array(
      z.object({
        key: z.string(),
        text: z.string(),
        rows: z.number(),
        suggestion: ref.nullable(),
        mapping: z.string().nullable(),
      }),
    ),
  }),
  /** Pending weight and amount recomputed by the system vs the file's own columns. */
  comparison: z.array(
    z.object({
      metric: z.string(),
      file: z.string(),
      computed: z.string(),
      matches: z.boolean(),
    }),
  ),
  /** Lines whose recomputed pending amount differs from the file. */
  mismatches: z.array(z.object({ row: z.number(), file: z.string(), computed: z.string() })),
  created: z
    .object({ orders: z.number(), lines: z.number(), parties: z.number(), aliases: z.number() })
    .nullable(),
});
export type OpeningImportReport = z.infer<typeof openingImportReportSchema>;
