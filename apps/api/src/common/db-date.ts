import { monthRange } from '@sms/shared';

// `@db.Date` columns are stored as UTC midnight; the API speaks YYYY-MM-DD.

export const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
export const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

/** `{ gte, lte }` for a from/to range, else a whole month, else no filter. */
export function dateRangeWhere(f: { from?: string; to?: string; month?: string }) {
  const range = f.from || f.to ? { from: f.from, to: f.to } : f.month ? monthRange(f.month) : null;
  if (!range) return undefined;
  return {
    ...(range.from ? { gte: toDbDate(range.from) } : {}),
    ...(range.to ? { lte: toDbDate(range.to) } : {}),
  };
}
