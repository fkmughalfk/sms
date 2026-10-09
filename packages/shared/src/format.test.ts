import { describe, expect, it } from 'vitest';
import {
  formatCommission,
  formatCompact,
  formatKg,
  formatNumber,
  formatPercent,
  formatPKR,
  formatPKR2,
  formatQty,
  formatTons,
} from './format';

describe('format', () => {
  it('PKR with thousands separators', () => {
    expect(formatPKR('1272188')).toBe('1,272,188');
    expect(formatPKR(0)).toBe('0');
    expect(formatPKR('999')).toBe('999');
    expect(formatPKR('10000000000')).toBe('10,000,000,000');
    expect(formatPKR('192187.5')).toBe('192,188');
    expect(formatPKR2('254437.6')).toBe('254,437.60');
  });

  it('negative values', () => {
    expect(formatPKR(-1500)).toBe('-1,500');
    expect(formatPKR('-0.4')).toBe('0');
  });

  it('commission to 2 dp', () => {
    expect(formatCommission('4452.658')).toBe('4,452.66');
    expect(formatCommission('710.9375')).toBe('710.94');
    expect(formatCommission('0.005')).toBe('0.01');
  });

  it('weight in KG and tons', () => {
    expect(formatKg('5000')).toBe('5,000');
    expect(formatKg('3.500')).toBe('3.5');
    expect(formatKg('0.125')).toBe('0.125');
    expect(formatTons('5000')).toBe('5.000');
    expect(formatTons('1234567')).toBe('1,234.567');
  });

  it('percentages', () => {
    expect(formatPercent('0.0035', 2)).toBe('0.35%');
    expect(formatPercent('0.25')).toBe('25.0%');
    expect(formatPercent('0.0001272188', 2)).toBe('0.01%');
  });

  it('quantities and generic numbers', () => {
    expect(formatQty(1200)).toBe('1,200');
    expect(formatNumber('1234.5', 1)).toBe('1,234.5');
  });
});

describe('formatCompact', () => {
  it('shortens large numbers for axes and tiles', () => {
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact('12900')).toBe('12.9K');
    expect(formatCompact('1272188')).toBe('1.3M');
    expect(formatCompact('10000000000')).toBe('10B');
    expect(formatCompact('1000000')).toBe('1M');
    expect(formatCompact('-45000')).toBe('-45K');
  });
});
