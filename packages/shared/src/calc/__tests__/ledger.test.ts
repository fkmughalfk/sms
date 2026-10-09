import { describe, expect, it } from 'vitest';
import { afterPayment, buildLedger, partyPosition } from '../index';

describe('partyPosition (Payments F5:G8)', () => {
  it('invoiced includes the opening balance; outstanding = invoiced − recovered', () => {
    const p = partyPosition({ openingBalance: '150000.50', sales: '1272188', recovered: '500000' });
    expect(p.invoiced.toString()).toBe('1422188.5');
    expect(p.outstanding.toString()).toBe('922188.5');
    expect(p.recoveryRate.toFixed(4)).toBe('0.3516');
  });

  it('handles a party with nothing invoiced (÷0 guard) and overpayment', () => {
    const p = partyPosition({ openingBalance: 0, sales: 0, recovered: 1000 });
    expect(p.outstanding.toString()).toBe('-1000');
    expect(p.recoveryRate.toString()).toBe('0');
  });

  it('after this payment', () => {
    expect(afterPayment('922188.5', '200000').toString()).toBe('722188.5');
  });
});

describe('buildLedger', () => {
  it('orders by date, invoices before payments on the same day, with a running balance', () => {
    const { rows, totalDebit, totalCredit, closingBalance } = buildLedger('10000', [
      { date: '2026-09-05', type: 'PAYMENT', sortKey: 'b', amount: '300000' },
      { date: '2026-09-02', type: 'INVOICE', sortKey: '000015', amount: '1272188' },
      { date: '2026-09-05', type: 'INVOICE', sortKey: '000016', amount: '5000' },
      { date: '2026-09-03', type: 'PAYMENT', sortKey: 'a', amount: '72188' },
    ]);
    expect(rows.map((r) => [r.item.date, r.item.type, r.balance.toString()])).toEqual([
      ['2026-09-02', 'INVOICE', '1282188'],
      ['2026-09-03', 'PAYMENT', '1210000'],
      ['2026-09-05', 'INVOICE', '1215000'],
      ['2026-09-05', 'PAYMENT', '915000'],
    ]);
    expect(totalDebit.toString()).toBe('1277188');
    expect(totalCredit.toString()).toBe('372188');
    expect(closingBalance.toString()).toBe('915000');
  });

  it('an empty ledger closes at the brought-forward balance', () => {
    expect(buildLedger('2500.75', []).closingBalance.toString()).toBe('2500.75');
  });
});
