import { describe, expect, it } from 'vitest';
import { percentRateSchema, rateToPercent, toComboboxOptions } from './masters';

describe('percentRateSchema (commission typed as %)', () => {
  it('converts a percentage to the stored fraction without float error', () => {
    expect(percentRateSchema.parse('0.35')).toBe('0.0035');
    expect(percentRateSchema.parse(' 1.5 ')).toBe('0.015');
    expect(percentRateSchema.parse('0.07')).toBe('0.0007');
    expect(percentRateSchema.parse('100')).toBe('1');
  });

  it('blank means "inherit" (null)', () => {
    expect(percentRateSchema.parse('')).toBeNull();
    expect(percentRateSchema.parse(null)).toBeNull();
    expect(percentRateSchema.parse(undefined)).toBeNull();
  });

  it('rejects out-of-range or malformed input', () => {
    for (const bad of ['101', '-1', 'abc', '0.12345', '1e2']) {
      expect(percentRateSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('round-trips with rateToPercent', () => {
    expect(rateToPercent('0.0035')).toBe('0.35');
    expect(rateToPercent(null)).toBe('');
    expect(percentRateSchema.parse(rateToPercent('0.004375'))).toBe('0.004375');
  });
});

describe('toComboboxOptions', () => {
  const active = [{ id: 'a', name: 'Kamoke' }];

  it('maps active rows', () => {
    expect(toComboboxOptions(active)).toEqual([{ value: 'a', label: 'Kamoke' }]);
  });

  it('keeps a deactivated current value visible, marked inactive', () => {
    expect(toComboboxOptions(active, { id: 'z', name: 'Old City' })).toEqual([
      { value: 'z', label: 'Old City (inactive)' },
      { value: 'a', label: 'Kamoke' },
    ]);
    expect(toComboboxOptions(active, { id: 'a', name: 'Kamoke' })).toHaveLength(1);
  });
});
