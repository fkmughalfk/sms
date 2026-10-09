import { describe, expect, it } from 'vitest';
import {
  businessMonth,
  businessToday,
  eachDay,
  eachMonth,
  fiscalYearRange,
  formatMonthHeading,
  monthRange,
  toBusinessDate,
} from './dates';

describe('business dates (Asia/Karachi, UTC+5)', () => {
  it('uses Karachi calendar date, not UTC', () => {
    // 2026-09-01 20:00 UTC = 2026-09-02 01:00 PKT
    expect(toBusinessDate(new Date('2026-09-01T20:00:00Z'))).toBe('2026-09-02');
    // 2026-09-02 18:59 UTC = 23:59 PKT, still the 2nd
    expect(businessToday(new Date('2026-09-02T18:59:00Z'))).toBe('2026-09-02');
  });

  it('businessMonth', () => {
    expect(businessMonth('2026-09-02')).toBe('2026-09');
  });

  it('monthRange handles month lengths and leap years', () => {
    expect(monthRange('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('fiscalYearRange', () => {
    expect(fiscalYearRange('2026-09-02', 1)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(fiscalYearRange('2026-09-02', 7)).toEqual({ from: '2026-07-01', to: '2027-06-30' });
    expect(fiscalYearRange('2026-03-15', 7)).toEqual({ from: '2025-07-01', to: '2026-06-30' });
  });

  it('formatMonthHeading', () => {
    expect(formatMonthHeading('2026-09')).toBe('SEPTEMBER 2026');
  });
});

describe('eachDay / eachMonth', () => {
  it('lists days inclusive, across month ends', () => {
    expect(eachDay('2026-09-29', '2026-10-02')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
    expect(eachDay('2026-09-02', '2026-09-02')).toEqual(['2026-09-02']);
    expect(eachDay('2026-09-03', '2026-09-02')).toEqual([]);
  });

  it('lists months inclusive, across year ends', () => {
    expect(eachMonth('2026-11-15', '2027-02-01')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(eachMonth('2026-01-01', '2026-12-31')).toHaveLength(12);
  });
});
