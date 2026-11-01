import { describe, expect, it } from 'vitest';
import { ageReceivables } from '../index';

const today = '2026-11-01';
const s = (d: { toString(): string }) => d.toString();

describe('ageReceivables (Phase 2 — oldest debt is paid first)', () => {
  it('applies payments to the oldest invoices and ages what is left', () => {
    const a = ageReceivables({
      openingBalance: 0,
      invoices: [
        { date: '2026-10-25', amount: 300 }, //  7 days
        { date: '2026-08-01', amount: 100 }, // 92 days — paid first
        { date: '2026-09-15', amount: 200 }, // 47 days
        { date: '2026-09-01', amount: 150 }, // 61 days
      ],
      recovered: 180,
      today,
      creditDays: 30,
    });
    // 180 clears #08-01 (100) and 80 of #09-01 → 70 left there.
    expect(s(a.buckets.d90plus)).toBe('0');
    expect(s(a.buckets.d61_90)).toBe('70');
    expect(s(a.buckets.d31_60)).toBe('200');
    expect(s(a.buckets.d0_30)).toBe('300');
    expect(s(a.overdue)).toBe('270'); // 70 + 200 — older than 30 days
    expect(a.overdueInvoices).toBe(2);
    expect(a.oldestOverdueDays).toBe(61);
  });

  it('respects the party credit days and the day boundary', () => {
    const a = ageReceivables({
      openingBalance: 0,
      invoices: [
        { date: '2026-10-02', amount: 100 }, // 30 days — not yet overdue
        { date: '2026-10-01', amount: 50 }, //  31 days — overdue
      ],
      recovered: 0,
      today,
      creditDays: 30,
    });
    expect(s(a.overdue)).toBe('50');
    expect(s(a.buckets.d0_30)).toBe('100');
    expect(s(a.buckets.d31_60)).toBe('50');
    expect(
      s(
        ageReceivables({
          openingBalance: 0,
          invoices: [{ date: '2026-10-01', amount: 50 }],
          recovered: 0,
          today,
          creditDays: 45,
        }).overdue,
      ),
    ).toBe('0');
  });

  it('treats an unpaid opening balance as oldest and overdue; a negative one as an advance', () => {
    const a = ageReceivables({
      openingBalance: '1000.50',
      invoices: [{ date: '2026-10-30', amount: 500 }],
      recovered: 400,
      today,
      creditDays: 30,
    });
    expect(s(a.openingUnpaid)).toBe('600.5');
    expect(s(a.buckets.d90plus)).toBe('600.5');
    expect(s(a.buckets.d0_30)).toBe('500');
    expect(s(a.overdue)).toBe('600.5');
    expect(a.overdueInvoices).toBe(0);
    expect(a.oldestOverdueDays).toBeNull();

    const advance = ageReceivables({
      openingBalance: -300,
      invoices: [{ date: '2026-08-01', amount: 500 }],
      recovered: 0,
      today,
      creditDays: 30,
    });
    expect(s(advance.overdue)).toBe('200');
  });

  it('nothing is due when payments cover everything (incl. overpayment)', () => {
    const a = ageReceivables({
      openingBalance: 100,
      invoices: [{ date: '2026-01-01', amount: 900 }],
      recovered: 1500,
      today,
      creditDays: 30,
    });
    expect(s(a.overdue)).toBe('0');
    expect(Object.values(a.buckets).map(s)).toEqual(['0', '0', '0', '0']);
    expect(a.oldestOverdueDays).toBeNull();
  });
});
