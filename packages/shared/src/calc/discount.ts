import { addDays, type DateString } from '../dates';
import { Decimal, dec, type DecimalInput, sum, ZERO } from './decimal';
import type { DiscountUnit } from './order';

// Prompt-payment discount (docs/ORDERS_DELIVERY_SPEC.md §6): agreed per category on the order,
// earned when the whole invoice is cleared within the party's credit days, and credited to
// the ledger automatically.

/** One delivered part of an invoice: the order's discount for that category and the weight. */
export interface DiscountPart {
  unit: DiscountUnit;
  /** Rs per 40 kg (rice, pulses) or per kg (ghee, spices). */
  rate: DecimalInput;
  weightKg: DecimalInput;
}

/** The discount an invoice can earn: Σ rate ÷ 40 × kg (or rate × kg), whole rupees, half down. */
export function promptDiscount(parts: readonly DiscountPart[]): Decimal {
  return sum(
    parts.map((p) =>
      p.unit === 'PER_40KG' ? dec(p.rate).div(40).times(p.weightKg) : dec(p.rate).times(p.weightKg),
    ),
  ).toDecimalPlaces(0, Decimal.ROUND_HALF_DOWN);
}

export interface DiscountInvoice {
  id: string;
  date: DateString;
  /** Tie-breaker for invoices of the same day (e.g. the zero-padded invoice no.). */
  sortKey: string;
  amount: DecimalInput;
  /** What it earns if cleared in time (0 = no discount). */
  discount: DecimalInput;
  /** The party's credit days when the invoice was recorded. */
  creditDays: number;
}

export interface EarnedDiscount {
  invoiceId: string;
  amount: Decimal;
  /** The day the invoice was cleared (never before the invoice date). */
  date: DateString;
}

/**
 * Which invoices earned their discount. Payments clear the oldest debt first (opening
 * balance, then invoices by date). An invoice counts as cleared once payments cover all the
 * debt up to it, less the discounts already earned and less its own discount — the party
 * pays the discounted amount. It must be cleared on or before invoice date + credit days;
 * part on time and part late earns nothing (owner, 2026-11-05).
 *
 * `excluded` invoices (discounts the office reversed) are never credited.
 */
export function earnedDiscounts(input: {
  openingBalance: DecimalInput;
  invoices: readonly DiscountInvoice[];
  payments: readonly { date: DateString; amount: DecimalInput }[];
  excluded?: ReadonlySet<string>;
}): EarnedDiscount[] {
  const opening = dec(input.openingBalance);
  const advance = opening.lt(0) ? opening.negated() : ZERO;
  const payments = [...input.payments].sort((a, b) => a.date.localeCompare(b.date));
  const invoices = [...input.invoices].sort(
    (a, b) => a.date.localeCompare(b.date) || a.sortKey.localeCompare(b.sortKey),
  );

  /** First date on which payments (plus any advance) reach `target`, or null. */
  const clearedOn = (target: Decimal): DateString | null => {
    if (advance.gte(target)) return '0000-00-00';
    let paid = advance;
    for (const p of payments) {
      paid = paid.plus(p.amount);
      if (paid.gte(target)) return p.date;
    }
    return null;
  };

  let debt = opening.gt(0) ? opening : ZERO;
  let earnedSoFar = ZERO;
  const out: EarnedDiscount[] = [];
  for (const inv of invoices) {
    debt = debt.plus(inv.amount);
    const discount = dec(inv.discount);
    if (discount.lte(0) || input.excluded?.has(inv.id)) continue;
    const on = clearedOn(debt.minus(earnedSoFar).minus(discount));
    if (on === null || on > addDays(inv.date, inv.creditDays)) continue;
    earnedSoFar = earnedSoFar.plus(discount);
    out.push({ invoiceId: inv.id, amount: discount, date: on < inv.date ? inv.date : on });
  }
  return out;
}
