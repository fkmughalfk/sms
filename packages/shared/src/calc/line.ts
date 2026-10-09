import { dec, Decimal, safeDivide, sum, type DecimalInput } from './decimal';

export interface LineInput {
  qtyPacks: number;
  rate40Kg: DecimalInput;
  /** Snapshot of the product's pack weight at save time. */
  packWeightKg: DecimalInput;
  /** Snapshot of the effective commission rate at save time. */
  commissionRate: DecimalInput;
}

/** Calculated line values, rounded to their storage scale (Prisma schema §4). */
export interface LineResult {
  ratePerPack: Decimal; // 4 dp
  amount: Decimal; // whole rupees
  commission: Decimal; // 4 dp
  weightKg: Decimal; // 3 dp
}

/** Spec §6.2. */
export function calcLine(line: LineInput): LineResult {
  const packWeight = dec(line.packWeightKg);
  const ratePerPack = dec(line.rate40Kg).div(40).times(packWeight); // G = F/40*E
  // H = ROUND(G*D, 0) — from the unrounded rate/pack
  const amount = ratePerPack.times(line.qtyPacks).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const commission = amount.times(line.commissionRate); // I = H * rate (not rounded)
  const weightKg = packWeight.times(line.qtyPacks); // J = D*E

  return {
    ratePerPack: ratePerPack.toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
    amount,
    commission: commission.toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
    weightKg: weightKg.toDecimalPlaces(3, Decimal.ROUND_HALF_UP),
  };
}

export interface TotalsInput {
  qtyPacks: number;
  amount: DecimalInput;
  commission: DecimalInput;
  weightKg: DecimalInput;
}

export interface Totals {
  totalPacks: number;
  totalAmount: Decimal;
  totalCommission: Decimal;
  totalWeightKg: Decimal;
  tons: Decimal;
  avgPerTon: Decimal;
  avgPerPack: Decimal;
}

/** Spec §6.3 — works for one invoice, a filtered list, or the dashboard. */
export function calcTotals(lines: readonly TotalsInput[]): Totals {
  const totalPacks = lines.reduce((n, l) => n + l.qtyPacks, 0);
  const totalAmount = sum(lines.map((l) => l.amount));
  const totalCommission = sum(lines.map((l) => l.commission));
  const totalWeightKg = sum(lines.map((l) => l.weightKg));
  const tons = totalWeightKg.div(1000);

  return {
    totalPacks,
    totalAmount,
    totalCommission,
    totalWeightKg,
    tons,
    avgPerTon: avgPerTon(totalAmount, tons),
    avgPerPack: avgPerPack(totalAmount, totalPacks),
  };
}

/** Calculates every line, then the totals from the calculated (stored-precision) values. */
export function calcInvoice<T extends LineInput>(
  lines: readonly T[],
): { lines: (T & LineResult)[]; totals: Totals } {
  const calculated = lines.map((l) => ({ ...l, ...calcLine(l) }));
  return { lines: calculated, totals: calcTotals(calculated) };
}

/** Total Sale ÷ Tons, rounded to paisa. */
export function avgPerTon(totalAmount: DecimalInput, tons: DecimalInput): Decimal {
  return safeDivide(totalAmount, tons).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Total Sale ÷ Packs, rounded to paisa. */
export function avgPerPack(totalAmount: DecimalInput, totalPacks: DecimalInput): Decimal {
  return safeDivide(totalAmount, totalPacks).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
