import { describe, expect, it } from 'vitest';
import { parseSort, sortAndPage } from './use-table';

const rows = [
  { name: 'Tayyab Traders', amount: '9287189', last: '2026-09-10' },
  { name: 'Awan Traders', amount: '50000.5', last: null },
  { name: 'pak rice traders', amount: '193457434', last: '2026-09-05' },
  { name: 'Item 10', amount: '7', last: '2026-09-01' },
  { name: 'Item 9', amount: '7', last: '2026-09-02' },
];
const columns = {
  name: { value: (r: (typeof rows)[number]) => r.name },
  amount: { value: (r: (typeof rows)[number]) => r.amount, numeric: true },
  last: { value: (r: (typeof rows)[number]) => r.last },
};

describe('sortAndPage (report tables)', () => {
  it('sorts amounts as exact decimals, not text', () => {
    expect(sortAndPage(rows, 'amount:desc', columns, 1, 10).map((r) => r.amount)).toEqual([
      '193457434',
      '9287189',
      '50000.5',
      '7',
      '7',
    ]);
  });

  it('sorts names case-insensitively with natural numbers (Item 9 before Item 10)', () => {
    expect(sortAndPage(rows, 'name:asc', columns, 1, 10).map((r) => r.name)).toEqual([
      'Awan Traders',
      'Item 9',
      'Item 10',
      'pak rice traders',
      'Tayyab Traders',
    ]);
  });

  it('puts empty values last in both directions', () => {
    expect(sortAndPage(rows, 'last:asc', columns, 1, 10).at(-1)?.name).toBe('Awan Traders');
    expect(sortAndPage(rows, 'last:desc', columns, 1, 10).at(-1)?.name).toBe('Awan Traders');
  });

  it('pages after sorting; unknown columns keep the original order', () => {
    expect(sortAndPage(rows, 'name:asc', columns, 2, 2).map((r) => r.name)).toEqual([
      'Item 10',
      'pak rice traders',
    ]);
    expect(sortAndPage(rows, 'nope:asc', columns, 1, 2)).toEqual(rows.slice(0, 2));
  });

  it('parseSort defaults to ascending', () => {
    expect(parseSort('amount')).toEqual({ field: 'amount', dir: 'asc' });
    expect(parseSort('amount:desc')).toEqual({ field: 'amount', dir: 'desc' });
  });
});
