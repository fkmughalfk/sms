import { dec, Decimal, type DecimalInput } from './calc/decimal';

// Display formatting (spec §8). Rounds with Decimal (half up) — never via JS floats.

/** Fixed decimals with thousands separators: `formatNumber('1272188', 0)` → "1,272,188". */
export function formatNumber(value: DecimalInput, decimals: number): string {
  const fixed = dec(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toFixed(decimals);
  const negative = fixed.startsWith('-');
  const [int = '0', frac] = (negative ? fixed.slice(1) : fixed).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const result = frac === undefined ? grouped : `${grouped}.${frac}`;
  // Avoid "-0" / "-0.00" after rounding
  return negative && /[1-9]/.test(result) ? `-${result}` : result;
}

/** PKR amount in whole rupees: "1,272,188". */
export function formatPKR(value: DecimalInput): string {
  return formatNumber(value, 0);
}

/** PKR with paisa: "254,437.60". */
export function formatPKR2(value: DecimalInput): string {
  return formatNumber(value, 2);
}

/** Commission displayed to 2 dp: "4,452.66". */
export function formatCommission(value: DecimalInput): string {
  return formatNumber(value, 2);
}

/** Weight in KG, trailing zeros dropped: "5,000", "3.5", "0.125". */
export function formatKg(value: DecimalInput): string {
  const d = dec(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  return formatNumber(d, d.decimalPlaces());
}

/** KG → tons, 3 dp: "5.000". */
export function formatTons(weightKg: DecimalInput): string {
  return formatNumber(dec(weightKg).div(1000), 3);
}

/** Ratio (0.0035) → percentage string ("0.35%"). */
export function formatPercent(ratio: DecimalInput, decimals = 1): string {
  return `${formatNumber(dec(ratio).times(100), decimals)}%`;
}

/** Packs / bags count: "1,200". */
export function formatQty(value: number): string {
  return formatNumber(value, 0);
}
