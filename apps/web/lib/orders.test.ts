import { describe, expect, it } from 'vitest';
import { packWord, previewLine, previewTotals } from './orders';

const moong = { basis: 'PER_40KG' as const, rate: '10250', packWeightKg: '25', packPcs: 1 };
const ghee = { basis: 'PER_UNIT' as const, rate: '2550', packWeightKg: '6', packPcs: 6 };

describe('order preview', () => {
  it('prices a line from the list rate, half rupee down', () => {
    expect(previewLine(moong, '30')?.amount.toString()).toBe('192187');
  });

  it('uses an office rate when typed', () => {
    expect(previewLine(moong, '2', '10000')?.amount.toString()).toBe('12500');
  });

  it('ghee cartons: 10 × 6 tins × 2,550', () => {
    expect(previewLine(ghee, '10')?.amount.toString()).toBe('153000');
  });

  it('incomplete lines are left out', () => {
    expect(previewLine(moong, '')).toBeNull();
    expect(previewLine(moong, '2.5')).toBeNull();
    expect(previewLine(moong, '0')).toBeNull();
    expect(previewLine(null, '3')).toBeNull();
    expect(previewLine(moong, '3', 'abc')).toBeNull();
  });

  it('totals skip incomplete lines', () => {
    const lines = [previewLine(moong, '30'), null, previewLine(ghee, '10')];
    const t = previewTotals(lines, [30, 5, 10]);
    expect([t.totalPacks, t.totalAmount.toString(), t.totalWeightKg.toString()]).toEqual([
      40,
      '345187',
      '810',
    ]);
  });

  it('bags vs cartons', () => {
    expect(packWord(1, 150)).toBe('bags');
    expect(packWord(6, 1)).toBe('carton');
  });
});

describe('packText', () => {
  it('shows bags, outers and cartons', async () => {
    const { packText } = await import('./orders');
    expect(packText('25', 1)).toBe('25 kg');
    expect(packText('40', 4)).toBe('4 × 10 kg');
    expect(packText('6', 12)).toBe('12 × 0.5 kg');
  });
});
