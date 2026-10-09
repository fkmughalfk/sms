import { BUSINESS_TIMEZONE } from './constants';

// Business dates are `YYYY-MM-DD` strings in Asia/Karachi (CLAUDE.md rule 9).

export type DateString = string;
export type MonthString = string; // YYYY-MM

export interface DateRange {
  from: DateString;
  to: DateString;
}

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Calendar date of `instant` in Asia/Karachi. */
export function toBusinessDate(instant: Date): DateString {
  const parts = Object.fromEntries(
    ymdFormatter.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** "Today" in Asia/Karachi. */
export function businessToday(now: Date = new Date()): DateString {
  return toBusinessDate(now);
}

/** "2026-09" for the given business date (default: today). */
export function businessMonth(date: DateString = businessToday()): MonthString {
  return date.slice(0, 7);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** First and last day of a `YYYY-MM` month. */
export function monthRange(month: MonthString): DateRange {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { from: `${month}-01`, to: `${month}-${pad(daysInMonth(y, m))}` };
}

/**
 * Fiscal year containing `date`, given `Setting.fiscalYearStartMonth` (1 = January).
 * e.g. start month 7 → 2026-09-02 falls in 2026-07-01 … 2027-06-30.
 */
export function fiscalYearRange(date: DateString, startMonth: number): DateRange {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const startYear = m >= startMonth ? y : y - 1;
  const from = `${startYear}-${pad(startMonth)}-01`;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endYear = startMonth === 1 ? startYear : startYear + 1;
  return { from, to: `${endYear}-${pad(endMonth)}-${pad(daysInMonth(endYear, endMonth))}` };
}

/** "SEPTEMBER 2026" — the month heading the Excel shows. */
export function formatMonthHeading(month: MonthString): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${name.toUpperCase()} ${y}`;
}
