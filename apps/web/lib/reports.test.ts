import { businessMonth, businessToday, monthRange } from '@sms/shared';
import { describe, expect, it } from 'vitest';
import { periodDays, presetRange } from './reports';

describe('report period presets (Asia/Karachi)', () => {
  const today = businessToday();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  it('this fiscal year contains today; default start month 1 = calendar year', () => {
    expect(presetRange('fy', 1)).toEqual({ from: `${year}-01-01`, to: `${year}-12-31` });
    const july = presetRange('fy', 7);
    expect(july.from <= today && today <= july.to).toBe(true);
  });

  it('last fiscal year is the year before this one', () => {
    expect(presetRange('last-fy', 1)).toEqual({
      from: `${year - 1}-01-01`,
      to: `${year - 1}-12-31`,
    });
    const july = presetRange('last-fy', 7);
    const thisFy = presetRange('fy', 7);
    expect(Number(july.from.slice(0, 4))).toBe(Number(thisFy.from.slice(0, 4)) - 1);
  });

  it('this month and last month', () => {
    expect(presetRange('month', 1)).toEqual(monthRange(businessMonth()));
    const last = presetRange('last-month', 1);
    const expected =
      month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
    expect(last).toEqual(monthRange(expected));
  });

  it('periodDays counts inclusive days', () => {
    expect(periodDays({ preset: 'custom', from: '2026-09-01', to: '2026-09-30' })).toBe(30);
    expect(periodDays({ preset: 'custom', from: '2026-01-01', to: '2026-12-31' })).toBe(365);
  });
});
