import { describe, expect, it } from 'vitest';
import {
  avgPerPack,
  avgPerTon,
  calcInvoice,
  calcLine,
  monthlyTarget,
  outstanding,
  packWeightKg,
  pctOfSales,
  recoveryRate,
  remainingTarget,
  resolveCommissionRate,
  targetAchieved,
} from '../index';

const RATE = '0.0035';

describe('golden test — invoice #15 (spec §6.4)', () => {
  const lines = [
    { name: 'MASAR SABIT 25KG', qtyPacks: 30, packWeightKg: 25, rate40Kg: 8000 },
    { name: 'DAAL MASH CHARI 25KG', qtyPacks: 20, packWeightKg: 25, rate40Kg: 16250 },
    { name: 'DAAL MOONG 25KG', qtyPacks: 30, packWeightKg: 25, rate40Kg: 10250 },
    { name: 'DALL MASOOR 25KG', qtyPacks: 20, packWeightKg: 25, rate40Kg: 8400 },
    { name: 'DAAL CHANNA SUPREME 25KG', qtyPacks: 100, packWeightKg: 25, rate40Kg: 9950 },
  ].map((l) => ({ ...l, commissionRate: RATE }));

  const expected = [
    { ratePerPack: '5000', amount: '150000', commission: '525', weightKg: '750' },
    { ratePerPack: '10156.25', amount: '203125', commission: '710.9375', weightKg: '500' },
    { ratePerPack: '6406.25', amount: '192188', commission: '672.658', weightKg: '750' },
    { ratePerPack: '5250', amount: '105000', commission: '367.5', weightKg: '500' },
    { ratePerPack: '6218.75', amount: '621875', commission: '2176.5625', weightKg: '2500' },
  ];

  it.each(lines.map((l, i) => [l.name, l, expected[i]!] as const))('%s', (_name, line, exp) => {
    const r = calcLine(line);
    expect(r.ratePerPack.toString()).toBe(exp.ratePerPack);
    expect(r.amount.toString()).toBe(exp.amount);
    expect(r.commission.toString()).toBe(exp.commission);
    expect(r.weightKg.toString()).toBe(exp.weightKg);
  });

  it('rounds 192,187.5 half up to 192,188', () => {
    expect(calcLine(lines[2]!).amount.toString()).toBe('192188');
  });

  it('totals: 200 bags / 1,272,188 / 4,452.658 / 5,000 KG', () => {
    const { totals } = calcInvoice(lines);
    expect(totals.totalPacks).toBe(200);
    expect(totals.totalAmount.toString()).toBe('1272188');
    expect(totals.totalCommission.toString()).toBe('4452.658');
    expect(totals.totalWeightKg.toString()).toBe('5000');
    expect(totals.tons.toString()).toBe('5');
    expect(totals.avgPerTon.toString()).toBe('254437.6');
    expect(totals.avgPerPack.toString()).toBe('6360.94');
  });
});

describe('packWeightKg', () => {
  it('10KG × 4 pcs = 40', () => {
    expect(packWeightKg(10, 4).toString()).toBe('40');
  });

  it('0.5KG ghee × 1 pc = 0.5', () => {
    expect(packWeightKg('0.5', 1).toString()).toBe('0.5');
  });
});

describe('calcLine — other products', () => {
  it('10KG × 4-pcs pack (40 KG): rate/pack equals rate40Kg', () => {
    const r = calcLine({
      qtyPacks: 15,
      packWeightKg: packWeightKg(10, 4),
      rate40Kg: 9000,
      commissionRate: RATE,
    });
    expect(r.ratePerPack.toString()).toBe('9000');
    expect(r.amount.toString()).toBe('135000');
    expect(r.commission.toString()).toBe('472.5');
    expect(r.weightKg.toString()).toBe('600');
  });

  it('0.5KG ghee product', () => {
    const r = calcLine({
      qtyPacks: 7,
      packWeightKg: '0.5',
      rate40Kg: '18500',
      commissionRate: RATE,
    });
    // 18500 / 40 × 0.5 = 231.25 ; × 7 = 1618.75 → 1619
    expect(r.ratePerPack.toString()).toBe('231.25');
    expect(r.amount.toString()).toBe('1619');
    expect(r.commission.toString()).toBe('5.6665');
    expect(r.weightKg.toString()).toBe('3.5');
  });

  it('computes amount from the unrounded rate/pack', () => {
    // 1234.57 / 40 × 0.5 = 15.432125 (stored 15.4321) ; × 1000 = 15432.125 → 15432
    const r = calcLine({
      qtyPacks: 1000,
      packWeightKg: '0.5',
      rate40Kg: '1234.57',
      commissionRate: RATE,
    });
    expect(r.ratePerPack.toString()).toBe('15.4321');
    expect(r.amount.toString()).toBe('15432');
  });

  it('does not use float math (0.1 + 0.2 style inputs)', () => {
    const r = calcLine({
      qtyPacks: 3,
      packWeightKg: '0.1',
      rate40Kg: '0.2',
      commissionRate: '0.1',
    });
    expect(r.weightKg.toString()).toBe('0.3');
  });
});

describe('resolveCommissionRate', () => {
  it('product override wins', () => {
    expect(resolveCommissionRate('0.01', '0.02', RATE).toString()).toBe('0.01');
  });
  it('falls back to category', () => {
    expect(resolveCommissionRate(null, '0.02', RATE).toString()).toBe('0.02');
  });
  it('falls back to default', () => {
    expect(resolveCommissionRate(undefined, null, RATE).toString()).toBe('0.0035');
  });
  it('a zero override is respected (not treated as unset)', () => {
    expect(resolveCommissionRate(0, '0.02', RATE).toString()).toBe('0');
  });
});

describe('÷0 guards', () => {
  it('empty invoice has zero totals and averages', () => {
    const { totals } = calcInvoice([]);
    expect(totals.totalPacks).toBe(0);
    expect(totals.totalAmount.toString()).toBe('0');
    expect(totals.avgPerTon.toString()).toBe('0');
    expect(totals.avgPerPack.toString()).toBe('0');
  });
  it('avgPerTon / avgPerPack with zero denominators', () => {
    expect(avgPerTon(1000, 0).toString()).toBe('0');
    expect(avgPerPack(1000, 0).toString()).toBe('0');
  });
  it('pctOfSales, targetAchieved, recoveryRate with zero denominators', () => {
    expect(pctOfSales(500, 0).toString()).toBe('0');
    expect(targetAchieved(500, 0).toString()).toBe('0');
    expect(recoveryRate(500, 0).toString()).toBe('0');
  });
});

describe('dashboard / recovery metrics', () => {
  it('pctOfSales', () => {
    expect(pctOfSales(250, 1000).toString()).toBe('0.25');
  });
  it('target achieved, remaining, monthly target', () => {
    expect(targetAchieved('1272188', '10000000000').toString()).toBe('0.0001272188');
    expect(remainingTarget('1272188', '10000000000').toString()).toBe('9998727812');
    expect(remainingTarget(200, 100).toString()).toBe('0');
    expect(monthlyTarget('10000000000').toString()).toBe('833333333.33');
  });
  it('outstanding and recovery rate', () => {
    expect(outstanding(1272188, 272188).toString()).toBe('1000000');
    expect(outstanding(100, 150).toString()).toBe('-50');
    expect(recoveryRate(250, 1000).toString()).toBe('0.25');
  });
});
