import { describe, expect, it } from 'vitest';
import { type CommissionConfig, commissionTotalRate, splitCommission } from '../index';

// docs/COMMISSION_SPEC.md §2 examples, on a Rs 100,000 line.
const config: CommissionConfig = {
  overrider: {
    salespersonId: 'farhan',
    rates: { rice: '0.0035', pulses: '0.0025', ghee: '0.0035', spices: '0.0035' },
  },
  shares: [
    {
      earnerId: 'arslan',
      matchPartySalespersonId: 'arslan',
      matchSubPartyId: null,
      rate: '0.0015',
    },
    {
      earnerId: 'arslan',
      matchPartySalespersonId: null,
      matchSubPartyId: 'arslan-sub',
      rate: '0.0015',
    },
  ],
};

const split = (category: string, partySalespersonId: string | null, subPartyId: string | null) =>
  splitCommission({
    amount: '100000',
    totalRate: commissionTotalRate(config, category, '0.0035'),
    config,
    partySalespersonId,
    subPartyId,
    invoiceSalespersonId: 'ali',
  }).map((r) => [r.salespersonId, r.basis, r.amount.toString()]);

describe('commission split', () => {
  it('rice, salesman Ali: Farhan 350', () => {
    expect(split('rice', 'ali', null)).toEqual([['farhan', 'OVERRIDE', '350']]);
  });

  it('pulses, Farhan: 250', () => {
    expect(split('pulses', 'farhan', null)).toEqual([['farhan', 'OVERRIDE', '250']]);
  });

  it('pulses through sub-party Arslan Dar: Farhan 100, Arslan 150', () => {
    expect(split('pulses', 'ali', 'arslan-sub')).toEqual([
      ['farhan', 'OVERRIDE', '100'],
      ['arslan', 'SHARE', '150'],
    ]);
  });

  it("spices to Arslan Dar's party: Farhan 200, Arslan 150", () => {
    expect(split('spices', 'arslan', null)).toEqual([
      ['farhan', 'OVERRIDE', '200'],
      ['arslan', 'SHARE', '150'],
    ]);
  });

  it('his party and his sub-party at once: Arslan is paid once', () => {
    expect(split('rice', 'arslan', 'arslan-sub')).toEqual([
      ['farhan', 'OVERRIDE', '200'],
      ['arslan', 'SHARE', '150'],
    ]);
  });

  it('a share never exceeds the total', () => {
    const rows = splitCommission({
      amount: '100000',
      totalRate: '0.001',
      config,
      partySalespersonId: 'arslan',
      subPartyId: null,
      invoiceSalespersonId: null,
    });
    expect(rows.map((r) => [r.salespersonId, r.amount.toString()])).toEqual([['arslan', '100']]);
  });

  it('no overriding salesman: the invoice salesman earns it all, as before', () => {
    const rows = splitCommission({
      amount: '192187',
      totalRate: '0.0035',
      config: { overrider: null, shares: config.shares },
      partySalespersonId: 'arslan',
      subPartyId: null,
      invoiceSalespersonId: 'farhan',
    });
    expect(rows.map((r) => [r.salespersonId, r.basis, r.amount.toString()])).toEqual([
      ['farhan', 'SALESMAN', '672.6545'],
    ]);
  });

  it('the total rate falls back to the usual chain for a category without his rate', () => {
    expect(commissionTotalRate(config, 'other', '0.004').toString()).toBe('0.004');
    expect(commissionTotalRate({ overrider: null, shares: [] }, 'rice', '0.0035').toString()).toBe(
      '0.0035',
    );
  });
});
