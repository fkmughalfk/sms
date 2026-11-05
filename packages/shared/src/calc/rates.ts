import { dec, type Decimal, type DecimalInput } from './decimal';

// Rate lists (docs/ORDERS_DELIVERY_SPEC.md §2).

/** How a rate-list rate is quoted: rice & pulses per 40 kg, desi ghee & spices per pack (tin). */
export const RATE_BASES = ['PER_40KG', 'PER_UNIT'] as const;
export type RateBasis = (typeof RATE_BASES)[number];

/**
 * Price of one pack as sold, unrounded.
 * - PER_40KG: rate ÷ 40 × pack weight (e.g. 11,300 per 40 kg → 25 kg bag = 7,062.5).
 * - PER_UNIT: rate × pieces per pack (e.g. ghee tin 2,550 × 6 tins = carton 15,300; a spice pack × 1).
 */
export function packRate(
  basis: RateBasis,
  rate: DecimalInput,
  packWeightKg: DecimalInput,
  packPcs: number,
): Decimal {
  return basis === 'PER_40KG' ? dec(rate).div(40).times(packWeightKg) : dec(rate).times(packPcs);
}

/** The basis a product's rate is quoted in when no earlier list says otherwise. */
export function defaultRateBasis(categoryName: string): RateBasis {
  return /ghee|spice|masala/i.test(categoryName) ? 'PER_UNIT' : 'PER_40KG';
}

/** Order categories like the printed rate list: rice, pulses, desi ghee, spices, then the rest. */
export function categoryRank(categoryName: string): number {
  const order = [/rice/i, /pulse|daal|dal/i, /ghee/i, /spice|masala/i];
  const i = order.findIndex((re) => re.test(categoryName));
  return i === -1 ? order.length : i;
}

const CROP_YEAR_RE = /^(\d{2}|\d{4})\s*[-/\\]\s*(\d{2}|\d{4})$/;

/**
 * Normalises a crop year to `YYYY-YYYY`: "25-26", "25/26", "25\26", "2025-26" → "2025-2026".
 * Blank → null. Returns `undefined` when the text isn't a crop year of two consecutive years.
 */
export function normalizeCropYear(text: string | null | undefined): string | null | undefined {
  const s = (text ?? '').trim();
  if (s === '') return null;
  const m = CROP_YEAR_RE.exec(s);
  if (!m) return undefined;
  const full = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  const from = full(m[1]!);
  const to = full(m[2]!);
  if (to !== from + 1) return undefined;
  return `${from}-${to}`;
}
