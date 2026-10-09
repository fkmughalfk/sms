import {
  calcLine,
  calcTotals,
  dec,
  type InvoiceDetail,
  type LineResult,
  type ProductOption,
  type Totals,
} from '@sms/shared';

/** A grid row as typed (strings, may be blank). */
export interface DraftLine {
  productId: string | null;
  qtyPacks: string;
  rate40Kg: string;
}

export interface Snapshot {
  packWeightKg: string;
  commissionRate: string;
}

/** A row's live calculation, or null while it's incomplete/invalid. */
export interface DraftCalc extends LineResult, Snapshot {
  qtyPacks: number;
}

export const blankLine = (): DraftLine => ({ productId: null, qtyPacks: '', rate40Kg: '' });

const QTY_RE = /^\d+$/;
const RATE_RE = /^\d+(\.\d{1,2})?$/;

export const isBlankLine = (l: DraftLine) =>
  !l.productId && l.qtyPacks.trim() === '' && l.rate40Kg.trim() === '';

/**
 * Live preview of every grid row with the same rules the API applies on save:
 * snapshots from the invoice being edited are reused per product in line order
 * (blank rows skipped); other lines use the product's current pack weight and rate.
 */
export function calcDraft(
  rows: DraftLine[],
  products: Map<string, ProductOption>,
  oldLines: { product: { id: string }; packWeightKg: string; commissionRate: string }[] = [],
): { lines: (DraftCalc | null)[]; totals: Totals } {
  const queues = new Map<string, Snapshot[]>();
  for (const l of oldLines) {
    const q = queues.get(l.product.id) ?? [];
    q.push({ packWeightKg: l.packWeightKg, commissionRate: l.commissionRate });
    queues.set(l.product.id, q);
  }

  const lines = rows.map((row): DraftCalc | null => {
    if (isBlankLine(row) || !row.productId) return null;
    const product = products.get(row.productId);
    const snapshot =
      queues.get(row.productId)?.shift() ??
      (product
        ? { packWeightKg: product.packWeightKg, commissionRate: product.effectiveCommissionRate }
        : null);
    const qty = row.qtyPacks.trim();
    const rate = row.rate40Kg.trim();
    if (!snapshot || !QTY_RE.test(qty) || !RATE_RE.test(rate)) return null;
    const qtyPacks = Number(qty);
    if (qtyPacks <= 0 || dec(rate).lte(0)) return null;
    return { ...snapshot, qtyPacks, ...calcLine({ ...snapshot, qtyPacks, rate40Kg: rate }) };
  });

  return { lines, totals: calcTotals(lines.filter((l): l is DraftCalc => l !== null)) };
}

/** Form values for editing a saved invoice. */
export function draftFromDetail(detail: InvoiceDetail) {
  return {
    invoiceNo: String(detail.invoiceNo),
    invoiceDate: detail.invoiceDate,
    partyId: detail.party.id,
    cityId: detail.city?.id ?? null,
    subPartyId: detail.subParty?.id ?? null,
    salespersonId: detail.salesperson?.id ?? null,
    remarks: detail.remarks ?? '',
    lines: detail.lines.map((l) => ({
      productId: l.product.id,
      qtyPacks: String(l.qtyPacks),
      rate40Kg: l.rate40Kg,
    })),
  };
}

/** Product ids used on more than one filled row (allowed — soft warning, spec §5.2). */
export function duplicateProductIds(rows: DraftLine[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const r of rows) {
    if (!r.productId) continue;
    if (seen.has(r.productId)) dupes.add(r.productId);
    seen.add(r.productId);
  }
  return dupes;
}
