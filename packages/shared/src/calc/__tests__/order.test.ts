import { describe, expect, it } from 'vitest';
import { calcLine, calcOrderLine, calcOrderTotals, discountUnit, pendingLine } from '../index';

describe('calcOrderLine', () => {
  it('per 40 kg matches the invoice calculation, half rupee down (Daal Moong 30 × 25 kg @ 10,250)', () => {
    const order = calcOrderLine({
      basis: 'PER_40KG',
      rate: '10250',
      packWeightKg: '25',
      packPcs: 1,
      qtyPacks: 30,
    });
    const invoice = calcLine({
      rate40Kg: '10250',
      packWeightKg: '25',
      qtyPacks: 30,
      commissionRate: '0',
    });
    expect(order.amount.toString()).toBe('192187');
    expect(order.amount.toString()).toBe(invoice.amount.toString());
    expect(order.ratePerPack.toString()).toBe('6406.25');
    expect(order.weightKg.toString()).toBe('750');
  });

  it('per pack: 10 cartons of ghee (6 × 1 kg tins @ 2,550) = 153,000, 60 kg', () => {
    const r = calcOrderLine({
      basis: 'PER_UNIT',
      rate: '2550',
      packWeightKg: '6',
      packPcs: 6,
      qtyPacks: 10,
    });
    expect([r.ratePerPack.toString(), r.amount.toString(), r.weightKg.toString()]).toEqual([
      '15300',
      '153000',
      '60',
    ]);
  });

  it('per pack: spices are pack price × packs (cumin 5.5 kg @ 6,550 × 3)', () => {
    const r = calcOrderLine({
      basis: 'PER_UNIT',
      rate: '6550',
      packWeightKg: '5.5',
      packPcs: 1,
      qtyPacks: 3,
    });
    expect([r.amount.toString(), r.weightKg.toString()]).toEqual(['19650', '16.5']);
  });

  it('one pending report line reproduces: Ashfaq 1121 Steam 150 × 25 kg @ 13,500 = 1,265,625', () => {
    const r = calcOrderLine({
      basis: 'PER_40KG',
      rate: '13500',
      packWeightKg: '25',
      packPcs: 1,
      qtyPacks: 150,
    });
    expect(r.amount.toString()).toBe('1265625');
  });
});

describe('calcOrderTotals', () => {
  it('adds packs, weight and amount', () => {
    const t = calcOrderTotals([
      { qtyPacks: 30, amount: '192187', weightKg: '750' },
      { qtyPacks: 10, amount: '153000', weightKg: '60' },
    ]);
    expect([t.totalPacks, t.totalAmount.toString(), t.totalWeightKg.toString()]).toEqual([
      40,
      '345187',
      '810',
    ]);
  });
});

describe('discountUnit', () => {
  it.each([
    ['Rice', 'PER_40KG'],
    ['Pulses', 'PER_40KG'],
    ['Desi Ghee', 'PER_KG'],
    ['Spices', 'PER_KG'],
  ])('%s → %s', (c, u) => expect(discountUnit(c)).toBe(u));
});

describe('pendingLine (pending orders report 04-11-2026)', () => {
  it('Shalimar 3092: 6,000 bags × 25 kg @ 13,500, 3,368 dispatched → 2,632 / 65,800 kg / 22,207,500', () => {
    const p = pendingLine({
      basis: 'PER_40KG',
      rate: '13500',
      packWeightKg: '25',
      packPcs: 1,
      qtyPacks: 6000,
      dispatchedPacks: 3368,
    });
    expect([p.pendingPacks, p.pendingWeightKg.toString(), p.pendingAmount.toString()]).toEqual([
      2632,
      '65800',
      '22207500',
    ]);
  });

  it('ghee, 10 cartons of 6 × 1 kg @ 2,550 a tin, none dispatched → 153,000', () => {
    const p = pendingLine({
      basis: 'PER_UNIT',
      rate: '2550',
      packWeightKg: '6',
      packPcs: 6,
      qtyPacks: 10,
      dispatchedPacks: 0,
    });
    expect([p.pendingPacks, p.pendingWeightKg.toString(), p.pendingAmount.toString()]).toEqual([
      10,
      '60',
      '153000',
    ]);
  });

  it('never negative, even if more was dispatched than ordered', () => {
    const p = pendingLine({
      basis: 'PER_40KG',
      rate: '9600',
      packWeightKg: '25',
      packPcs: 1,
      qtyPacks: 10,
      dispatchedPacks: 12,
    });
    expect([p.pendingPacks, p.pendingAmount.toString()]).toEqual([0, '0']);
  });
});
