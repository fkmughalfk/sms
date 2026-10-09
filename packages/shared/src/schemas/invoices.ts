import { z } from 'zod';
import { dec } from '../calc/decimal';
import { dateStringSchema, optionalIdSchema, optionalTextSchema } from './common';

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
