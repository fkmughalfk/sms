import DecimalJs from 'decimal.js';

/**
 * Decimal constructor used for all money math (CLAUDE.md rule 1).
 * A private clone so we never depend on — or mutate — the global decimal.js config.
 */
export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

/** Anything a calc function accepts: a Decimal, a decimal string, or an integer-safe number. */
export type DecimalInput = DecimalJs.Value;

export const ZERO = new Decimal(0);

export function dec(value: DecimalInput): Decimal {
  return new Decimal(value);
}

/** `a ÷ b`, or 0 when `b` is 0 (spec §6.3 "guard ÷0"). */
export function safeDivide(a: DecimalInput, b: DecimalInput): Decimal {
  const divisor = dec(b);
  return divisor.isZero() ? ZERO : dec(a).div(divisor);
}

export function sum(values: Iterable<DecimalInput>): Decimal {
  let total = ZERO;
  for (const v of values) total = total.plus(v);
  return total;
}
