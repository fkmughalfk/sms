import type { ProductOption } from '@sms/shared';
import { describe, expect, it } from 'vitest';
import { blankLine, calcDraft, duplicateProductIds } from './invoices';

const product = (id: string, packWeightKg = '25', rate = '0.0035'): ProductOption => ({
  id,
  name: id,
  sku: 1,
  packWeightKg,
  effectiveCommissionRate: rate,
  categoryId: 'c',
});

const products = new Map(
  ['masar', 'mash', 'moong', 'masoor', 'channa'].map((id) => [id, product(id)]),
);

describe('calcDraft — the live grid', () => {
  it('shows exactly the invoice #15 numbers (spec §6.4) as the user types', () => {
    const rows = [
      { productId: 'masar', qtyPacks: '30', rate40Kg: '8000' },
      { productId: 'mash', qtyPacks: '20', rate40Kg: '16250' },
      { productId: 'moong', qtyPacks: '30', rate40Kg: '10250' },
      { productId: 'masoor', qtyPacks: '20', rate40Kg: '8400' },
      { productId: 'channa', qtyPacks: '100', rate40Kg: '9950' },
      blankLine(),
    ];
    const { lines, totals } = calcDraft(rows, products);
    expect(lines.map((l) => l?.amount.toString())).toEqual([
      '150000',
      '203125',
      '192188',
      '105000',
      '621875',
      undefined,
    ]);
    expect(lines[2]?.ratePerPack.toString()).toBe('6406.25');
    expect(lines[2]?.commission.toString()).toBe('672.658');
    expect(totals.totalPacks).toBe(200);
    expect(totals.totalAmount.toString()).toBe('1272188');
    expect(totals.totalCommission.toString()).toBe('4452.658');
    expect(totals.totalWeightKg.toString()).toBe('5000');
  });

  it('leaves incomplete or invalid rows out of the totals', () => {
    const { lines, totals } = calcDraft(
      [
        { productId: 'masar', qtyPacks: '', rate40Kg: '8000' },
        { productId: 'masar', qtyPacks: '0', rate40Kg: '8000' },
        { productId: 'masar', qtyPacks: '2.5', rate40Kg: '8000' },
        { productId: 'masar', qtyPacks: '1', rate40Kg: '8000.123' },
        { productId: 'unknown', qtyPacks: '1', rate40Kg: '8000' },
        { productId: 'masar', qtyPacks: '1', rate40Kg: '8000' },
      ],
      products,
    );
    expect(lines.map((l) => l !== null)).toEqual([false, false, false, false, false, true]);
    expect(totals.totalAmount.toString()).toBe('5000');
  });

  it('when editing, reuses saved snapshots per product in order (like the API)', () => {
    // The product has since changed to 50 KG / 1%; the saved line used 25 KG / 0.35%.
    const changed = new Map([['moong', product('moong', '50', '0.01')]]);
    const old = [{ product: { id: 'moong' }, packWeightKg: '25', commissionRate: '0.0035' }];
    const { lines } = calcDraft(
      [
        { productId: 'moong', qtyPacks: '30', rate40Kg: '10250' },
        { productId: 'moong', qtyPacks: '1', rate40Kg: '10250' }, // added now → current values
      ],
      changed,
      old,
    );
    expect(lines[0]).toMatchObject({ packWeightKg: '25', commissionRate: '0.0035' });
    expect(lines[0]?.amount.toString()).toBe('192188');
    expect(lines[1]).toMatchObject({ packWeightKg: '50', commissionRate: '0.01' });
  });

  it('flags duplicate products', () => {
    expect([
      ...duplicateProductIds([
        { productId: 'a', qtyPacks: '', rate40Kg: '' },
        { productId: 'b', qtyPacks: '', rate40Kg: '' },
        { productId: 'a', qtyPacks: '', rate40Kg: '' },
        blankLine(),
      ]),
    ]).toEqual(['a']);
  });
});
