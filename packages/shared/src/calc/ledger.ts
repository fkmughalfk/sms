import { type Decimal, dec, type DecimalInput, sum, ZERO } from './decimal';
import { outstanding, recoveryRate } from './metrics';

// Party position and ledger (spec §5.4, §6.3). Pure functions over already-summed values.

export interface PositionInput {
  openingBalance: DecimalInput;
  sales: DecimalInput;
  recovered: DecimalInput;
}

export interface Position {
  openingBalance: Decimal;
  sales: Decimal;
  /** openingBalance + sales (spec: "Invoiced = Σ invoice totalAmount (+ openingBalance)"). */
  invoiced: Decimal;
  recovered: Decimal;
  outstanding: Decimal;
  recoveryRate: Decimal;
}

export function partyPosition(p: PositionInput): Position {
  const invoiced = dec(p.openingBalance).plus(p.sales);
  const recovered = dec(p.recovered);
  return {
    openingBalance: dec(p.openingBalance),
    sales: dec(p.sales),
    invoiced,
    recovered,
    outstanding: outstanding(invoiced, recovered),
    recoveryRate: recoveryRate(recovered, invoiced),
  };
}

/** "After this payment" = outstanding − amount being entered. */
export function afterPayment(outstandingNow: DecimalInput, amount: DecimalInput): Decimal {
  return dec(outstandingNow).minus(amount);
}

export interface LedgerItem {
  date: string; // YYYY-MM-DD
  type: 'INVOICE' | 'PAYMENT';
  /** Tie-breaker within a day (e.g. zero-padded invoice no. or createdAt). */
  sortKey: string;
  amount: DecimalInput;
}

export interface LedgerRow<T extends LedgerItem> {
  item: T;
  debit: Decimal;
  credit: Decimal;
  balance: Decimal;
}

/**
 * Chronological ledger with running balance: invoices are debits, payments credits.
 * Same-day order: invoices before payments, then by `sortKey`.
 */
export function buildLedger<T extends LedgerItem>(
  broughtForward: DecimalInput,
  items: readonly T[],
): { rows: LedgerRow<T>[]; totalDebit: Decimal; totalCredit: Decimal; closingBalance: Decimal } {
  const sorted = [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.type === b.type ? 0 : a.type === 'INVOICE' ? -1 : 1) ||
      a.sortKey.localeCompare(b.sortKey),
  );
  let balance = dec(broughtForward);
  const rows = sorted.map((item) => {
    const debit = item.type === 'INVOICE' ? dec(item.amount) : ZERO;
    const credit = item.type === 'PAYMENT' ? dec(item.amount) : ZERO;
    balance = balance.plus(debit).minus(credit);
    return { item, debit, credit, balance };
  });
  return {
    rows,
    totalDebit: sum(rows.map((r) => r.debit)),
    totalCredit: sum(rows.map((r) => r.credit)),
    closingBalance: balance,
  };
}
