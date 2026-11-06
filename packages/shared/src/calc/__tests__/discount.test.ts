import { describe, expect, it } from 'vitest';
import { earnedDiscounts, promptDiscount } from '../index';

describe('promptDiscount', () => {
  it('rice / pulses per 40 kg, ghee / spices per kg, half rupee down', () => {
    // 150 bags × 25 kg rice at Rs 100 per 40 kg = 9,375; 60 kg ghee at Rs 5 per kg = 300
    expect(
      promptDiscount([
        { unit: 'PER_40KG', rate: '100', weightKg: '3750' },
        { unit: 'PER_KG', rate: '5', weightKg: '60' },
      ]).toString(),
    ).toBe('9675');
    // 30 kg pulses at Rs 25 per 40 kg = 18.75 → 19; 2.5 kg at Rs 3 = 7.5 → 7
    expect(promptDiscount([{ unit: 'PER_40KG', rate: '25', weightKg: '30' }]).toString()).toBe(
      '19',
    );
    expect(promptDiscount([{ unit: 'PER_KG', rate: '3', weightKg: '2.5' }]).toString()).toBe('7');
  });
});

describe('earnedDiscounts (30 credit days)', () => {
  const inv = (id: string, date: string, amount: string, discount: string, creditDays = 30) => ({
    id,
    date,
    sortKey: id,
    amount,
    discount,
    creditDays,
  });

  it('paid in full on day 25 → earned; on day 31 → not', () => {
    const invoices = [inv('A', '2026-11-01', '100000', '1000')];
    expect(
      earnedDiscounts({
        openingBalance: 0,
        invoices,
        payments: [{ date: '2026-11-26', amount: '100000' }],
      }),
    ).toEqual([{ invoiceId: 'A', amount: expect.anything(), date: '2026-11-26' }]);
    expect(
      earnedDiscounts({
        openingBalance: 0,
        invoices,
        payments: [{ date: '2026-12-02', amount: '100000' }],
      }),
    ).toEqual([]);
  });

  it('the last allowed day counts (invoice date + credit days)', () => {
    const r = earnedDiscounts({
      openingBalance: 0,
      invoices: [inv('A', '2026-11-01', '100000', '1000')],
      payments: [{ date: '2026-12-01', amount: '100000' }],
    });
    expect(r.map((x) => x.date)).toEqual(['2026-12-01']);
  });

  it('paying the discounted amount clears the invoice', () => {
    const r = earnedDiscounts({
      openingBalance: 0,
      invoices: [inv('A', '2026-11-01', '100000', '1000')],
      payments: [{ date: '2026-11-10', amount: '99000' }],
    });
    expect(r.map((x) => x.amount.toString())).toEqual(['1000']);
  });

  it('part on time and part late earns nothing', () => {
    const r = earnedDiscounts({
      openingBalance: 0,
      invoices: [inv('A', '2026-11-01', '100000', '1000')],
      payments: [
        { date: '2026-11-10', amount: '60000' },
        { date: '2026-12-15', amount: '39000' },
      ],
    });
    expect(r).toEqual([]);
  });

  it('older debt is paid first: an unpaid opening balance blocks the discount', () => {
    const r = earnedDiscounts({
      openingBalance: '50000',
      invoices: [inv('A', '2026-11-01', '100000', '1000')],
      payments: [{ date: '2026-11-10', amount: '99000' }],
    });
    expect(r).toEqual([]);
  });

  it('an advance (negative opening balance) counts as paid', () => {
    const r = earnedDiscounts({
      openingBalance: '-99000',
      invoices: [inv('A', '2026-11-01', '100000', '1000')],
      payments: [],
    });
    expect(r).toEqual([{ invoiceId: 'A', amount: expect.anything(), date: '2026-11-01' }]);
  });

  it('two invoices: each on time earns; a discount earned lowers what the next needs', () => {
    const r = earnedDiscounts({
      openingBalance: 0,
      invoices: [inv('A', '2026-11-01', '100000', '1000'), inv('B', '2026-11-05', '50000', '500')],
      payments: [
        { date: '2026-11-20', amount: '99000' },
        { date: '2026-11-30', amount: '49500' },
      ],
    });
    expect(r.map((x) => [x.invoiceId, x.date])).toEqual([
      ['A', '2026-11-20'],
      ['B', '2026-11-30'],
    ]);
  });

  it('a reversed discount is not credited, so the next invoice needs the full amount', () => {
    const invoices = [
      inv('A', '2026-11-01', '100000', '1000'),
      inv('B', '2026-11-05', '50000', '500'),
    ];
    const payments = [{ date: '2026-11-20', amount: '148500' }];
    expect(
      earnedDiscounts({ openingBalance: 0, invoices, payments }).map((x) => x.invoiceId),
    ).toEqual(['A', 'B']);
    expect(
      earnedDiscounts({ openingBalance: 0, invoices, payments, excluded: new Set(['A']) }).map(
        (x) => x.invoiceId,
      ),
    ).toEqual([]);
  });

  it('a 40-day party has 40 days', () => {
    const r = earnedDiscounts({
      openingBalance: 0,
      invoices: [inv('A', '2026-11-01', '100000', '1000', 40)],
      payments: [{ date: '2026-12-08', amount: '99000' }],
    });
    expect(r).toHaveLength(1);
  });
});
