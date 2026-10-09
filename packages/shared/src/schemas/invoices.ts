import { z } from 'zod';
import { dec } from '../calc/decimal';
import {
  dateStringSchema,
  monthStringSchema,
  optionalIdSchema,
  optionalTextSchema,
  paginatedSchema,
  paginationQuerySchema,
} from './common';

// Sales invoice input (spec §5.2). Only user-entered fields: anything calculated
// (rate/pack, amount, commission, weight, totals, snapshots) is stripped — the server recomputes it.

const cellSchema = z.union([z.string(), z.number()]).nullish();

/** A grid row as the form sends it; may be blank or half-filled. */
export const invoiceLineDraftSchema = z.object({
  productId: z.string().nullish(),
  qtyPacks: cellSchema,
  rate40Kg: cellSchema,
});
export type InvoiceLineDraft = z.infer<typeof invoiceLineDraftSchema>;

/** A validated line. */
export interface InvoiceLineInput {
  /** 1-based position after blank rows are dropped. */
  lineNo: number;
  productId: string;
  qtyPacks: number;
  /** Canonical decimal string, ≤ 2 dp. */
  rate40Kg: string;
}

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
const isBlankRow = (l: InvoiceLineDraft) =>
  isBlank(l.productId) && isBlank(l.qtyPacks) && isBlank(l.rate40Kg);

const QTY_RE = /^\d+$/;
const RATE_RE = /^\d+(\.\d{1,2})?$/;

function parseQty(v: InvoiceLineDraft['qtyPacks']): number | null {
  const s = String(v ?? '').trim();
  if (!QTY_RE.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function parseRate(v: InvoiceLineDraft['rate40Kg']): string | null {
  const s = String(v ?? '').trim();
  if (!RATE_RE.test(s)) return null;
  const d = dec(s);
  return d.gt(0) ? d.toString() : null;
}

/** Validates grid rows with the Excel `ValidateForm` messages; drops fully blank rows. */
export const invoiceLinesSchema = z
  .array(invoiceLineDraftSchema)
  .superRefine((rows, ctx) => {
    let filled = 0;
    rows.forEach((row, i) => {
      if (isBlankRow(row)) return;
      filled++;
      const n = i + 1; // the row number the user sees in the grid
      if (isBlank(row.productId)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'productId'],
          message: `Line ${n}: select a product.`,
        });
      }
      if (parseQty(row.qtyPacks) === null) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'qtyPacks'],
          message: `Line ${n}: enter Qty (Packs).`,
        });
      }
      if (parseRate(row.rate40Kg) === null) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'rate40Kg'],
          message: `Line ${n}: enter Rate 40Kg.`,
        });
      }
    });
    if (filled === 0) ctx.addIssue({ code: 'custom', message: 'Enter at least one product line.' });
  })
  .transform((rows): InvoiceLineInput[] =>
    rows
      .filter((row) => !isBlankRow(row))
      .map((row, i) => ({
        lineNo: i + 1,
        productId: String(row.productId).trim(),
        qtyPacks: parseQty(row.qtyPacks)!,
        rate40Kg: parseRate(row.rate40Kg)!,
      })),
  );

/** `POST /invoices`, `PUT /invoices/:id`, `POST /invoices/preview`. */
export const invoiceInputSchema = z.object({
  invoiceNo: z.coerce
    .number({ error: 'Enter the Invoice No.' })
    .int('Enter the Invoice No.')
    .positive('Enter the Invoice No.'),
  invoiceDate: dateStringSchema('Enter the Invoice Date.'),
  partyId: z.string({ error: 'Enter the Party (Name).' }).trim().min(1, 'Enter the Party (Name).'),
  cityId: optionalIdSchema,
  subPartyId: optionalIdSchema,
  salespersonId: optionalIdSchema,
  remarks: optionalTextSchema(500),
  lines: invoiceLinesSchema,
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
export type InvoiceFormValues = z.input<typeof invoiceInputSchema>;

/** Product ids that appear on more than one line — allowed, but the UI shows a soft warning. */
export function findDuplicateProducts(lines: readonly { productId: string }[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const { productId } of lines) {
    if (seen.has(productId)) dupes.add(productId);
    seen.add(productId);
  }
  return [...dupes];
}

// ── List filters (spec §5.3) ──

const optionalFilterId = z.string().trim().min(1).optional();

/** Filters shared by `GET /invoices`, `GET /invoices/lines` and `GET /invoices/export`. */
export const invoiceFilterSchema = z.object({
  /** `YYYY-MM`; ignored when `from`/`to` are given. */
  month: monthStringSchema.optional(),
  from: dateStringSchema().optional(),
  to: dateStringSchema().optional(),
  partyId: optionalFilterId,
  cityId: optionalFilterId,
  salespersonId: optionalFilterId,
  productId: optionalFilterId,
  categoryId: optionalFilterId,
  invoiceNo: z.coerce.number().int().positive().optional(),
});
export type InvoiceFilter = z.infer<typeof invoiceFilterSchema>;

export const invoiceListQuerySchema = paginationQuerySchema.extend(invoiceFilterSchema.shape);
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

// ── Responses (decimals are strings, dates YYYY-MM-DD) ──

const ref = z.object({ id: z.string(), name: z.string() });

/** Footer totals (Database Q5:R10). */
export const invoiceTotalsSchema = z.object({
  invoices: z.number(),
  totalPacks: z.number(),
  totalWeightKg: z.string(),
  tons: z.string(),
  totalAmount: z.string(),
  totalCommission: z.string(),
  avgPerTon: z.string(),
  avgPerPack: z.string(),
});
export type InvoiceTotals = z.infer<typeof invoiceTotalsSchema>;

/** One row per invoice. */
export const invoiceRowSchema = z.object({
  id: z.string(),
  invoiceNo: z.number(),
  invoiceDate: z.string(),
  party: ref,
  city: ref.nullable(),
  subParty: ref.nullable(),
  salesperson: ref.nullable(),
  remarks: z.string().nullable(),
  lineCount: z.number(),
  totalPacks: z.number(),
  totalWeightKg: z.string(),
  totalAmount: z.string(),
  totalCommission: z.string(),
});
export type InvoiceRow = z.infer<typeof invoiceRowSchema>;

export const invoiceListSchema = paginatedSchema(invoiceRowSchema).extend({
  totals: invoiceTotalsSchema,
});
export type InvoiceList = z.infer<typeof invoiceListSchema>;

/** A saved line with its snapshots and calculated values. */
export const invoiceLineSchema = z.object({
  id: z.string(),
  lineNo: z.number(),
  product: ref.extend({ sku: z.number() }),
  qtyPacks: z.number(),
  rate40Kg: z.string(),
  packWeightKg: z.string(),
  commissionRate: z.string(),
  ratePerPack: z.string(),
  amount: z.string(),
  commission: z.string(),
  weightKg: z.string(),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

export const invoiceDetailSchema = invoiceRowSchema.extend({
  lines: z.array(invoiceLineSchema),
  createdBy: ref,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Whether the current user may edit/delete it (spec §3). */
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;

/** One row per line, with its invoice header — the `tblLines` view. */
export const invoiceLineRowSchema = invoiceLineSchema.extend({
  invoiceId: z.string(),
  invoiceNo: z.number(),
  invoiceDate: z.string(),
  party: ref,
  city: ref.nullable(),
  salesperson: ref.nullable(),
  category: ref,
});
export type InvoiceLineRow = z.infer<typeof invoiceLineRowSchema>;

export const invoiceLineListSchema = paginatedSchema(invoiceLineRowSchema).extend({
  totals: invoiceTotalsSchema,
});
export type InvoiceLineList = z.infer<typeof invoiceLineListSchema>;

/** `POST /invoices/preview` — calculated lines and totals, nothing saved. */
export const invoicePreviewSchema = z.object({
  lines: z.array(invoiceLineSchema.omit({ id: true })),
  totals: invoiceTotalsSchema,
});
export type InvoicePreview = z.infer<typeof invoicePreviewSchema>;

export const nextInvoiceNoSchema = z.object({ invoiceNo: z.number() });

/** 409 body when the invoice number is taken, so the UI can offer "open it for edit?". */
export const invoiceConflictSchema = z.object({
  statusCode: z.literal(409),
  message: z.string(),
  code: z.literal('INVOICE_EXISTS'),
  invoiceId: z.string().nullable(),
});
