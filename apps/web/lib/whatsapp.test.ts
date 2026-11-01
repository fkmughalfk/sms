import type { PartyPosition } from '@sms/shared';
import { describe, expect, it } from 'vitest';
import { statementMessage, waLink, waPhone } from './whatsapp';

describe('waPhone', () => {
  it('turns common Pakistani formats into 92XXXXXXXXXX', () => {
    expect(waPhone('0300-1234567')).toBe('923001234567');
    expect(waPhone('+92 300 1234567')).toBe('923001234567');
    expect(waPhone('00923001234567')).toBe('923001234567');
    expect(waPhone('3001234567')).toBe('923001234567');
  });

  it('rejects blanks and numbers that are not mobile-length', () => {
    expect(waPhone(null)).toBeNull();
    expect(waPhone('')).toBeNull();
    expect(waPhone('042-1234567')).toBeNull();
  });

  it('builds a wa.me link, letting WhatsApp ask for the chat when there is no phone', () => {
    expect(waLink('0300-1234567', 'Hi & bye')).toBe(
      'https://wa.me/923001234567?text=Hi%20%26%20bye',
    );
    expect(waLink(null, 'x')).toBe('https://wa.me/?text=x');
  });
});

describe('statementMessage', () => {
  const position = (over: Partial<PartyPosition>): PartyPosition => ({
    party: { id: 'p', name: 'Pak Rice Traders' },
    openingBalance: '0',
    sales: '0',
    invoiced: '0',
    recovered: '0',
    outstanding: '353125.25',
    recoveryRate: '0',
    lastPaymentDate: null,
    creditDays: 30,
    creditLimit: null,
    overdue: '0',
    overdueInvoices: 0,
    oldestOverdueDays: null,
    ageing: { d0_30: '0', d31_60: '0', d61_90: '0', d90plus: '0' },
    ...over,
  });

  it('lists balance, overdue and last payment', () => {
    const text = statementMessage(
      'WAQAR RICE MILLS',
      position({ overdue: '150000' }),
      '2026-11-01',
      { date: '2026-09-10', amount: '50000.25' },
    );
    expect(text).toBe(
      [
        '*WAQAR RICE MILLS*',
        'Account statement — Pak Rice Traders',
        'As of 01-11-2026',
        '',
        'Balance due: PKR 353,125',
        'Overdue (over 30 days): PKR 150,000',
        'Last payment: PKR 50,000 on 10-09-2026',
        '',
        'Kindly arrange the payment. Thank you.',
      ].join('\n'),
    );
  });

  it('shows an advance without asking for payment', () => {
    const text = statementMessage('WRM', position({ outstanding: '-1000' }), '2026-11-01');
    expect(text).toContain('Advance with us: PKR 1,000');
    expect(text).not.toContain('Kindly');
  });
});
