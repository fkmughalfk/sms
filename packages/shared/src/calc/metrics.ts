import { dec, Decimal, safeDivide, ZERO, type DecimalInput } from './decimal';

// Spec §6.3 — dashboard and recovery figures. Ratios are returned unrounded; format.ts rounds for display.

/** Share of a row's amount in the grand total (0–1). */
export function pctOfSales(amount: DecimalInput, grandTotalAmount: DecimalInput): Decimal {
  return safeDivide(amount, grandTotalAmount);
}

/** Actual sales ÷ annual target (0–1+). */
export function targetAchieved(totalAmount: DecimalInput, annualTarget: DecimalInput): Decimal {
  return safeDivide(totalAmount, annualTarget);
}

/** max(0, target − actual). */
export function remainingTarget(totalAmount: DecimalInput, annualTarget: DecimalInput): Decimal {
  return Decimal.max(ZERO, dec(annualTarget).minus(totalAmount));
}

/** Annual target ÷ 12, rounded to paisa. */
export function monthlyTarget(annualTarget: DecimalInput): Decimal {
  return dec(annualTarget).div(12).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Invoiced − recovered (negative means the party has paid in advance). */
export function outstanding(invoiced: DecimalInput, recovered: DecimalInput): Decimal {
  return dec(invoiced).minus(recovered);
}

/** Recovered ÷ invoiced (0–1+). */
export function recoveryRate(recovered: DecimalInput, invoiced: DecimalInput): Decimal {
  return safeDivide(recovered, invoiced);
}
