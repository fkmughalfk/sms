import {
  avgPerPack,
  avgPerTon,
  dec,
  type InvoiceLine,
  type InvoiceRow,
  type InvoiceTotals,
} from '@sms/shared';
import type { Prisma } from '../generated/prisma/client';

// Prisma ⇄ API shapes for invoices. Dates are `@db.Date`: stored as UTC midnight.

export const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
export const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

const ref = { select: { id: true, name: true } } as const;

export const invoiceRowSelect = {
  id: true,
  invoiceNo: true,
  invoiceDate: true,
  party: ref,
  city: ref,
  subParty: ref,
  salesperson: ref,
  remarks: true,
  totalPacks: true,
  totalWeightKg: true,
  totalAmount: true,
  totalCommission: true,
  _count: { select: { lines: true } },
} satisfies Prisma.InvoiceSelect;

export const invoiceLineSelect = {
  id: true,
  lineNo: true,
  product: { select: { id: true, name: true, sku: true } },
  qtyPacks: true,
  rate40Kg: true,
  packWeightKg: true,
  commissionRate: true,
  ratePerPack: true,
  amount: true,
  commission: true,
  weightKg: true,
} satisfies Prisma.InvoiceLineSelect;

type RowRec = Prisma.InvoiceGetPayload<{ select: typeof invoiceRowSelect }>;
type LineRec = Prisma.InvoiceLineGetPayload<{ select: typeof invoiceLineSelect }>;

export function toInvoiceRow(r: RowRec): InvoiceRow {
  return {
    id: r.id,
    invoiceNo: r.invoiceNo,
    invoiceDate: fromDbDate(r.invoiceDate),
    party: r.party,
    city: r.city,
    subParty: r.subParty,
    salesperson: r.salesperson,
    remarks: r.remarks,
    lineCount: r._count.lines,
    totalPacks: r.totalPacks,
    totalWeightKg: r.totalWeightKg.toString(),
    totalAmount: r.totalAmount.toString(),
    totalCommission: r.totalCommission.toString(),
  };
}

export function toInvoiceLine(l: LineRec): InvoiceLine {
  return {
    id: l.id,
    lineNo: l.lineNo,
    product: l.product,
    qtyPacks: l.qtyPacks,
    rate40Kg: l.rate40Kg.toString(),
    packWeightKg: l.packWeightKg.toString(),
    commissionRate: l.commissionRate.toString(),
    ratePerPack: l.ratePerPack.toString(),
    amount: l.amount.toString(),
    commission: l.commission.toString(),
    weightKg: l.weightKg.toString(),
  };
}

/** Footer totals from SQL sums (spec §5.3, §6.3). */
export function toTotals(sums: {
  invoices: number;
  packs: number | null;
  weightKg: { toString(): string } | null;
  amount: { toString(): string } | null;
  commission: { toString(): string } | null;
}): InvoiceTotals {
  const weightKg = dec(sums.weightKg?.toString() ?? 0);
  const amount = dec(sums.amount?.toString() ?? 0);
  const packs = sums.packs ?? 0;
  const tons = weightKg.div(1000);
  return {
    invoices: sums.invoices,
    totalPacks: packs,
    totalWeightKg: weightKg.toString(),
    tons: tons.toString(),
    totalAmount: amount.toString(),
    totalCommission: dec(sums.commission?.toString() ?? 0).toString(),
    avgPerTon: avgPerTon(amount, tons).toString(),
    avgPerPack: avgPerPack(amount, packs).toString(),
  };
}
