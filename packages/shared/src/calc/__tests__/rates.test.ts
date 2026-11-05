import { describe, expect, it } from 'vitest';
import { categoryRank, defaultRateBasis, normalizeCropYear, packRate } from '../index';

describe('packRate (rate list 04-11-2026)', () => {
  it('per 40 kg: 25 kg bag of Daal Chana Supreme @ 11,300 = 7,062.5', () => {
    expect(packRate('PER_40KG', '11300', '25', 1).toString()).toBe('7062.5');
  });

  it('per 40 kg: Platinum 10 kg × 4 outer @ 11,800 = 11,800 per outer', () => {
    expect(packRate('PER_40KG', '11800', '40', 4).toString()).toBe('11800');
  });

  it('per pack: ghee 1 kg tin 2,550 × 6 per carton = 15,300', () => {
    expect(packRate('PER_UNIT', '2550', '6', 6).toString()).toBe('15300');
  });

  it('per pack: ghee 500 g tin 1,450 × 12 per carton = 17,400', () => {
    expect(packRate('PER_UNIT', '1450', '6', 12).toString()).toBe('17400');
  });

  it('per pack: a 5.5 kg cumin pack is its printed price, 6,550', () => {
    expect(packRate('PER_UNIT', '6550', '5.5', 1).toString()).toBe('6550');
  });
});

describe('defaultRateBasis', () => {
  it.each([
    ['Rice', 'PER_40KG'],
    ['Pulses', 'PER_40KG'],
    ['Desi Ghee', 'PER_UNIT'],
    ['Spices', 'PER_UNIT'],
  ])('%s → %s', (category, basis) => {
    expect(defaultRateBasis(category)).toBe(basis);
  });
});

describe('normalizeCropYear', () => {
  it.each([
    ['25-26', '2025-2026'],
    ['25/26', '2025-2026'],
    ['25\\26', '2025-2026'],
    ['2026-27', '2026-2027'],
    [' 2025-2026 ', '2025-2026'],
  ])('%s → %s', (input, out) => {
    expect(normalizeCropYear(input)).toBe(out);
  });

  it('blank is no crop year', () => {
    expect(normalizeCropYear('')).toBeNull();
    expect(normalizeCropYear(null)).toBeNull();
  });

  it('rejects anything that is not two consecutive years (e.g. the list typo 27\\27)', () => {
    expect(normalizeCropYear('27\\27')).toBeUndefined();
    expect(normalizeCropYear('2025')).toBeUndefined();
    expect(normalizeCropYear('25-27')).toBeUndefined();
  });
});

describe('categoryRank', () => {
  it('orders rice, pulses, desi ghee, spices, then anything else', () => {
    const names = ['Spices', 'Other', 'Desi Ghee', 'Rice', 'Pulses'];
    expect([...names].sort((a, b) => categoryRank(a) - categoryRank(b))).toEqual([
      'Rice',
      'Pulses',
      'Desi Ghee',
      'Spices',
      'Other',
    ]);
  });
});
