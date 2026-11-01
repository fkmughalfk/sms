import { daysBetween, type DateString } from '../dates';
import { type Decimal, dec, type DecimalInput, ZERO } from './decimal';

// Receivables ageing (Phase 2): what is still unpaid, how old it is, and what is overdue.

/** Company default when a party has no credit days of its own. */
export const DEFAULT_CREDIT_DAYS = 30;

export interface AgeingInput {
  /** Balance from before the system; its date is unknown, so it is treated as oldest and overdue. */
  openingBalance: DecimalInput;
  invoices: readonly { date: DateString; amount: DecimalInput }[];
  /** Σ payments for the party. */
  recovered: DecimalInput;
  today: DateString;
  creditDays: number;
}

export interface AgeingBuckets {
  /** 0–30 days old. */
  d0_30: Decimal;
  d31_60: Decimal;
  d61_90: Decimal;
  /** Over 90 days, plus any unpaid opening balance. */
  d90plus: Decimal;
}

export interface Ageing {
  buckets: AgeingBuckets;
  /** Unpaid amount older than the party's credit days (incl. unpaid opening balance). */
  overdue: Decimal;
  /** Invoices with an overdue unpaid amount. */
  overdueInvoices: number;
  /** Age in days of the oldest overdue invoice (null if none). */
  oldestOverdueDays: number | null;
  /** Unpaid opening balance still outstanding. */
  openingUnpaid: Decimal;
}

const bucketFor = (days: number): keyof AgeingBuckets =>
  days <= 30 ? 'd0_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90plus';

/**
 * Payments are applied to the oldest debt first (opening balance, then invoices by date);
 * whatever is left unpaid is aged from its invoice date to `today`. A negative opening
 * balance (advance) counts as money already received.
 */
export function ageReceivables(input: AgeingInput): Ageing {
  const opening = dec(input.openingBalance);
  let credit = dec(input.recovered).plus(opening.lt(0) ? opening.negated() : ZERO);

  const buckets: AgeingBuckets = { d0_30: ZERO, d31_60: ZERO, d61_90: ZERO, d90plus: ZERO };
  let overdue = ZERO;
  let overdueInvoices = 0;
  let oldestOverdueDays: number | null = null;

  const openingDebt = opening.gt(0) ? opening : ZERO;
  const openingPaid = minDec(credit, openingDebt);
  credit = credit.minus(openingPaid);
  const openingUnpaid = openingDebt.minus(openingPaid);
  if (openingUnpaid.gt(0)) {
    buckets.d90plus = buckets.d90plus.plus(openingUnpaid);
    overdue = overdue.plus(openingUnpaid);
  }

  const invoices = [...input.invoices].sort((a, b) => a.date.localeCompare(b.date));
  for (const inv of invoices) {
    const amount = dec(inv.amount);
    const paid = minDec(credit, amount);
    credit = credit.minus(paid);
    const unpaid = amount.minus(paid);
    if (unpaid.lte(0)) continue;
    const age = Math.max(0, daysBetween(inv.date, input.today));
    const key = bucketFor(age);
    buckets[key] = buckets[key].plus(unpaid);
    if (age > input.creditDays) {
      overdue = overdue.plus(unpaid);
      overdueInvoices++;
      oldestOverdueDays = Math.max(oldestOverdueDays ?? 0, age);
    }
  }

  return { buckets, overdue, overdueInvoices, oldestOverdueDays, openingUnpaid };
}

function minDec(a: Decimal, b: Decimal): Decimal {
  return a.lt(b) ? a : b;
}
