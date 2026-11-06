import { Decimal, dec, type DecimalInput } from './decimal';

// Salesman commission (docs/COMMISSION_SPEC.md). One salesman (Farhan) earns on every sale at
// his rate for the category; share rules give someone (Arslan Dar) a flat rate out of it on
// the sales they're tied to (their parties, or their sub-party). Nobody else earns for now.

export const COMMISSION_BASES = ['OVERRIDE', 'SHARE', 'SALESMAN'] as const;
export type CommissionBasis = (typeof COMMISSION_BASES)[number];

export interface CommissionConfig {
  /** The salesman who earns on all sales, and his rate per category (fractions, 0.0035). */
  overrider: { salespersonId: string; rates: Readonly<Record<string, DecimalInput>> } | null;
  shares: readonly {
    earnerId: string;
    /** Matches sales to parties whose salesman is this one. */
    matchPartySalespersonId: string | null;
    /** Matches sales through this sub-party. */
    matchSubPartyId: string | null;
    rate: DecimalInput;
  }[];
}

/**
 * The line's total commission rate: the overriding salesman's rate for its category when
 * he has one, else the usual chain (product → category → default), passed as `fallback`.
 */
export function commissionTotalRate(
  config: CommissionConfig,
  categoryId: string,
  fallback: DecimalInput,
): Decimal {
  const own = config.overrider?.rates[categoryId];
  return dec(own ?? fallback);
}

export interface CommissionShareRow {
  salespersonId: string;
  basis: CommissionBasis;
  /** Fraction of the line amount. */
  rate: Decimal;
  /** amount × rate, unrounded (stored to 4 dp like the line's commission). */
  amount: Decimal;
}

/**
 * Who earns what on one line. Shares come out of the total (never above it, each earner
 * once); the overriding salesman keeps the rest. Without an overriding salesman the whole
 * commission goes to the invoice's salesman, as before. The rows add up to amount × total rate.
 */
export function splitCommission(input: {
  amount: DecimalInput;
  totalRate: DecimalInput;
  config: CommissionConfig;
  partySalespersonId: string | null;
  subPartyId: string | null;
  invoiceSalespersonId: string | null;
}): CommissionShareRow[] {
  const amount = dec(input.amount);
  const total = dec(input.totalRate);
  const row = (salespersonId: string, basis: CommissionBasis, rate: Decimal) => ({
    salespersonId,
    basis,
    rate,
    amount: amount.times(rate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
  });

  const o = input.config.overrider;
  if (!o) {
    return input.invoiceSalespersonId && total.gt(0)
      ? [row(input.invoiceSalespersonId, 'SALESMAN', total)]
      : [];
  }
  const rows: CommissionShareRow[] = [];
  let left = total;
  const paid = new Set<string>();
  for (const s of input.config.shares) {
    const matches =
      (s.matchPartySalespersonId !== null &&
        s.matchPartySalespersonId === input.partySalespersonId) ||
      (s.matchSubPartyId !== null && s.matchSubPartyId === input.subPartyId);
    if (!matches || paid.has(s.earnerId) || s.earnerId === o.salespersonId) continue;
    const r = Decimal.min(dec(s.rate), left);
    if (r.lte(0)) continue;
    paid.add(s.earnerId);
    left = left.minus(r);
    rows.push(row(s.earnerId, 'SHARE', r));
  }
  if (left.gt(0)) rows.unshift(row(o.salespersonId, 'OVERRIDE', left));
  return rows;
}
