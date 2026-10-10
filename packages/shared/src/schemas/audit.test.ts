import { describe, expect, it } from 'vitest';
import { auditDiff } from './audit';

describe('auditDiff', () => {
  it('lists only the fields that changed', () => {
    expect(
      auditDiff(
        { name: 'Ali', phone: '0300', isActive: true, lines: [1, 2] },
        { name: 'Ali', phone: '0301', isActive: false, lines: [1, 2] },
      ),
    ).toEqual([
      { field: 'phone', before: '0300', after: '0301' },
      { field: 'isActive', before: true, after: false },
    ]);
  });

  it('handles create (no before) and delete (no after)', () => {
    expect(auditDiff(null, { amount: '10' })).toEqual([
      { field: 'amount', before: undefined, after: '10' },
    ]);
    expect(auditDiff({ amount: '10' }, null)).toEqual([
      { field: 'amount', before: '10', after: undefined },
    ]);
  });
});
