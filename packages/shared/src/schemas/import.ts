import { z } from 'zod';

// One-time Excel import (spec §11). Names are matched trimmed + case-insensitively.

/** What to do with a Sheet1 party name that doesn't match a party. */
export const partyMappingSchema = z.discriminatedUnion('action', [
  /** Use this existing (or about-to-be-imported) party, by name. */
  z.object({ action: z.literal('map'), party: z.string().trim().min(1) }),
  /** Create a new party with this (cleaned) name. */
  z.object({ action: z.literal('create'), name: z.string().trim().min(1) }),
  /** Leave these payments out. */
  z.object({ action: z.literal('skip') }),
]);
export type PartyMapping = z.infer<typeof partyMappingSchema>;

/**
 * Decisions for names the workbook can't resolve by itself. Keys are the raw text
 * lower-cased and trimmed. Bank value: a bank name from the list, or null = no bank
 * (the original text is always kept in the payment's remarks).
 */
export const importMappingSchema = z.object({
  parties: z.record(z.string(), partyMappingSchema).default({}),
  banks: z.record(z.string(), z.string().trim().min(1).nullable()).default({}),
});
export type ImportMapping = z.infer<typeof importMappingSchema>;

const status = z.enum(['create', 'exists']);

export const importReportSchema = z.object({
  dryRun: z.boolean(),
  /** True when nothing blocks the import (all names mapped, no unreadable rows). */
  ready: z.boolean(),
  summary: z.object({
    categories: z.object({ create: z.number(), exists: z.number() }),
    products: z.object({ create: z.number(), exists: z.number() }),
    cities: z.object({ create: z.number(), exists: z.number() }),
    salespersons: z.object({ create: z.number(), exists: z.number() }),
    parties: z.object({ create: z.number(), exists: z.number() }),
    subParties: z.object({ create: z.number(), exists: z.number() }),
    banks: z.object({ create: z.number(), exists: z.number() }),
    invoices: z.object({ create: z.number(), exists: z.number(), lines: z.number() }),
    payments: z.object({
      create: z.number(),
      exists: z.number(),
      duplicate: z.number(),
      skipped: z.number(),
      unmapped: z.number(),
    }),
  }),
  /** Recalculated with the app's rules vs the Excel Dashboard / Database figures. */
  comparison: z.array(
    z.object({
      metric: z.string(),
      excel: z.string().nullable(),
      computed: z.string(),
      matches: z.boolean(),
    }),
  ),
  /** Lines where the recalculated amount/commission differs from the Excel cell (spec §11.3). */
  mismatches: z.array(
    z.object({
      invoiceNo: z.number(),
      row: z.number(),
      product: z.string(),
      field: z.enum(['amount', 'commission']),
      excel: z.string(),
      computed: z.string(),
    }),
  ),
  /** Sheet1 party names that need a decision (spec §11.5). */
  unmatchedParties: z.array(
    z.object({
      raw: z.string(),
      key: z.string(),
      payments: z.number(),
      amount: z.string(),
      suggestion: z.string().nullable(),
      mapping: partyMappingSchema.nullable(),
    }),
  ),
  /** Sheet1 bank texts and the bank each will use. */
  banks: z.array(
    z.object({
      raw: z.string(),
      key: z.string(),
      payments: z.number(),
      suggestion: z.string().nullable(),
      mapped: z.string().nullable().optional(),
    }),
  ),
  /** Names every party mapping may point at (existing + about to be imported). */
  partyNames: z.array(z.string()),
  bankNames: z.array(z.string()),
  invoices: z.array(
    z.object({
      invoiceNo: z.number(),
      invoiceDate: z.string(),
      party: z.string(),
      lines: z.number(),
      totalAmount: z.string(),
      status,
    }),
  ),
  /** Rows that can't be imported as they are (bad date, unknown product…). */
  problems: z.array(z.object({ sheet: z.string(), row: z.number(), message: z.string() })),
  /** After a real run: what was written. */
  created: z
    .object({ masters: z.number(), invoices: z.number(), lines: z.number(), payments: z.number() })
    .optional(),
});
export type ImportReport = z.infer<typeof importReportSchema>;
