import { dec, type Decimal, type DecimalInput } from './decimal';

/** Products!E = C × D */
export function packWeightKg(unitWeightKg: DecimalInput, packPcs: number): Decimal {
  return dec(unitWeightKg).times(packPcs);
}

/**
 * Effective commission rate (spec §6.1): product override → category rate → settings default.
 * `null`/`undefined` mean "not set"; an explicit 0 is a valid rate.
 */
export function resolveCommissionRate(
  productRate: DecimalInput | null | undefined,
  categoryRate: DecimalInput | null | undefined,
  defaultRate: DecimalInput,
): Decimal {
  return dec(productRate ?? categoryRate ?? defaultRate);
}
