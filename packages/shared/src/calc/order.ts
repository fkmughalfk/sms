import { dec, Decimal, type DecimalInput, sum } from './decimal';
import { defaultRateBasis, packRate, type RateBasis } from './rates';

// Orders (docs/ORDERS_DELIVERY_SPEC.md §3): booked at rate-list rates.

export interface OrderLineCalcInput {
  basis: RateBasis;
  /** Booked rate: per 40 kg (rice, pulses) or per tin / pack (ghee, spices). */
  rate: DecimalInput;
  /** Snapshot of the product's pack weight (unit kg × pieces). */
  packWeightKg: DecimalInput;
  /** Snapshot of pieces per pack (ghee: tins per carton). */
  packPcs: number;
  qtyPacks: number;
}

export interface OrderLineResult {
  ratePerPack: Decimal; // 4 dp
  amount: Decimal; // whole rupees
  weightKg: Decimal; // 3 dp
}

/**
 * One order line. The amount is worked out from the unrounded pack price and, like
 * invoices (CLAUDE.md rule 3), a half rupee rounds down. For a per-40-kg line this is
 * exactly the invoice calculation, so an invoice at the booked rate matches the order.
 */
export function calcOrderLine(line: OrderLineCalcInput): OrderLineResult {
  const perPack = packRate(line.basis, line.rate, line.packWeightKg, line.packPcs);
  return {
    ratePerPack: perPack.toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
    amount: perPack.times(line.qtyPacks).toDecimalPlaces(0, Decimal.ROUND_HALF_DOWN),
    weightKg: dec(line.packWeightKg).times(line.qtyPacks).toDecimalPlaces(3, Decimal.ROUND_HALF_UP),
  };
}

export interface OrderTotals {
  totalPacks: number;
  totalWeightKg: Decimal;
  totalAmount: Decimal;
}

export function calcOrderTotals(
  lines: { qtyPacks: number; amount: DecimalInput; weightKg: DecimalInput }[],
): OrderTotals {
  return {
    totalPacks: lines.reduce((n, l) => n + l.qtyPacks, 0),
    totalWeightKg: sum(lines.map((l) => l.weightKg)),
    totalAmount: sum(lines.map((l) => l.amount)),
  };
}

/**
 * The prompt-payment discount on an order is agreed per category: rice and pulses in
 * Rs per 40 kg, desi ghee and spices in Rs per kg (as on the Urdu order form).
 */
export type DiscountUnit = 'PER_40KG' | 'PER_KG';
export function discountUnit(categoryName: string): DiscountUnit {
  return defaultRateBasis(categoryName) === 'PER_40KG' ? 'PER_40KG' : 'PER_KG';
}

export interface PendingLine {
  pendingPacks: number;
  pendingWeightKg: Decimal;
  /** Value of the bags still to deliver at the booked rate (half rupee down). */
  pendingAmount: Decimal;
}

/**
 * What is left of an order line: ordered − dispatched (dispatched never goes below 0 or
 * above the order). The pending amount is priced like any order line, so the report's
 * "AMOUNT" = weight remaining ÷ 40 × rate for rice and pulses.
 */
export function pendingLine(line: OrderLineCalcInput & { dispatchedPacks: number }): PendingLine {
  const pending = Math.max(0, line.qtyPacks - Math.max(0, line.dispatchedPacks));
  const c = calcOrderLine({ ...line, qtyPacks: pending });
  return { pendingPacks: pending, pendingWeightKg: c.weightKg, pendingAmount: c.amount };
}
