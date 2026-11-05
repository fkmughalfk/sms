import { describe, expect, it } from 'vitest';
import {
  formatEffective,
  formatRate,
  groupByCategory,
  rateChange,
  shortCropYear,
} from './rate-lists';

describe('rate list helpers', () => {
  it('formats rates with their own decimals', () => {
    expect(formatRate('11300')).toBe('11,300');
    expect(formatRate('2550.5')).toBe('2,550.5');
  });

  it('shows the effective time as Karachi local time', () => {
    expect(formatEffective('2026-11-04T09:00')).toBe('04 Nov 2026, 09:00 am');
    expect(formatEffective('2026-11-04T15:30')).toBe('04 Nov 2026, 03:30 pm');
  });

  it('short crop year as printed on the list', () => {
    expect(shortCropYear('2025-2026')).toBe('25-26');
    expect(shortCropYear(null)).toBe('');
  });

  it('rate change against the previous list', () => {
    expect(rateChange('11800', '11500')).toEqual({ text: '+300', direction: 'up' });
    expect(rateChange('9600', '9800')).toEqual({ text: '−200', direction: 'down' });
    expect(rateChange('9600', '9600')).toEqual({ text: '—', direction: 'same' });
    expect(rateChange('9600', null)).toEqual({ text: 'new', direction: 'new' });
    expect(rateChange(null, '9600')).toBeNull();
  });

  it('groups lines by category in order', () => {
    const line = (category: string, name: string) => ({ product: { category, name } as never });
    const groups = groupByCategory([line('Rice', 'a'), line('Pulses', 'b'), line('Rice', 'c')]);
    expect(groups.map(([c, ls]) => [c, ls.length])).toEqual([
      ['Rice', 2],
      ['Pulses', 1],
    ]);
  });
});
