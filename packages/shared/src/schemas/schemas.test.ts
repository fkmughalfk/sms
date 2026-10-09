import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { changePasswordSchema, loginSchema } from './auth';
import {
  commissionRateSchema,
  decimalSchema,
  masterListQuerySchema,
  nameSchema,
  paginationQuerySchema,
} from './common';
import { findDuplicateProducts, invoiceInputSchema } from './invoices';
import { partySchema, productSchema, updatePartySchema, updateProductSchema } from './masters';
import { paymentInputSchema, updatePaymentSchema } from './payments';
import { createUserSchema, updateUserSchema } from './users';

const messages = (result: z.ZodSafeParseResult<unknown>) =>
  result.success ? [] : result.error.issues.map((i) => i.message);

describe('common', () => {
  it('names are trimmed and required', () => {
    expect(nameSchema().parse('  Tayyab Traders ')).toBe('Tayyab Traders');
    expect(messages(nameSchema().safeParse('   '))).toEqual(['Enter a name.']);
  });

  it('decimals become canonical strings, never floats', () => {
    const money = decimalSchema({ maxDecimals: 2 });
    expect(money.parse(16250)).toBe('16250');
    expect(money.parse(' 016250.50 ')).toBe('16250.5');
    expect(money.parse('-0.00')).toBe('0');
    expect(money.safeParse('1e5').success).toBe(false);
    expect(money.safeParse('abc').success).toBe(false);
    expect(messages(money.safeParse('1.234'))).toEqual(['Use at most 2 decimal places.']);
  });

  it('commission rate is a fraction between 0 and 1', () => {
    expect(commissionRateSchema.parse('0.0035')).toBe('0.0035');
    expect(commissionRateSchema.safeParse('1.5').success).toBe(false);
    expect(commissionRateSchema.safeParse('-0.01').success).toBe(false);
  });

  it('pagination defaults and sort format', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 50 });
    expect(paginationQuerySchema.parse({ page: '2', sort: 'invoiceDate:desc' })).toMatchObject({
      page: 2,
      sort: 'invoiceDate:desc',
    });
    expect(paginationQuerySchema.safeParse({ sort: 'invoiceDate; drop' }).success).toBe(false);
    expect(masterListQuerySchema.parse({ active: 'false' }).active).toBe(false);
  });
});

describe('auth & users', () => {
  it('login lowercases and trims email', () => {
    expect(loginSchema.parse({ email: ' Admin@Example.com ', password: 'x' }).email).toBe(
      'admin@example.com',
    );
  });

  it('new password must differ', () => {
    const r = changePasswordSchema.safeParse({
      currentPassword: 'Password1!',
      newPassword: 'Password1!',
    });
    expect(messages(r)).toEqual(['New password must differ from the current one.']);
  });

  it('create user defaults role to USER; update does not touch omitted role', () => {
    const created = createUserSchema.parse({
      name: 'Ali',
      email: 'ali@x.pk',
      password: 'longenough',
    });
    expect(created.role).toBe('USER');
    expect(updateUserSchema.parse({ name: 'Ali K' })).toEqual({ name: 'Ali K' });
  });
});

describe('masters', () => {
  it('product: decimal weight, default pack pcs, optional commission override', () => {
    const p = productSchema.parse({
      sku: 1,
      name: ' DAAL MOONG 25KG ',
      unitWeightKg: 25,
      categoryId: 'c1',
    });
    expect(p).toEqual({
      sku: 1,
      name: 'DAAL MOONG 25KG',
      unitWeightKg: '25',
      packPcs: 1,
      categoryId: 'c1',
      commissionRate: null,
    });
    expect(
      productSchema.safeParse({ sku: 2, name: 'Ghee', unitWeightKg: '0', categoryId: 'c1' })
        .success,
    ).toBe(false);
  });

  it('PATCH schemas do not re-apply create defaults or clear omitted fields', () => {
    expect(updateProductSchema.parse({ name: 'X' })).toEqual({ name: 'X' });
    expect(updatePartySchema.parse({ phone: '0300' })).toEqual({ phone: '0300' });
  });

  it('party: blank optional fields become null, opening balance defaults to 0', () => {
    expect(partySchema.parse({ name: 'Pak Rice Traders', cityId: '', phone: '  ' })).toEqual({
      name: 'Pak Rice Traders',
      cityId: null,
      phone: null,
      openingBalance: '0',
    });
  });
});

describe('invoiceInputSchema (spec §5.2 validation)', () => {
  const valid = {
    invoiceNo: '15',
    invoiceDate: '2026-09-02',
    partyId: 'p1',
    cityId: 'c1',
    salespersonId: 's1',
    lines: [
      { productId: 'a', qtyPacks: '30', rate40Kg: '8000' },
      { productId: '', qtyPacks: '', rate40Kg: '' }, // blank grid row
      { productId: 'b', qtyPacks: 20, rate40Kg: 16250.5 },
    ],
  };

  it('parses a valid invoice, drops blank rows and renumbers lines', () => {
    const r = invoiceInputSchema.parse(valid);
    expect(r.invoiceNo).toBe(15);
    expect(r.subPartyId).toBeNull();
    expect(r.lines).toEqual([
      { lineNo: 1, productId: 'a', qtyPacks: 30, rate40Kg: '8000' },
      { lineNo: 2, productId: 'b', qtyPacks: 20, rate40Kg: '16250.5' },
    ]);
  });

  it('strips client-sent calculated values (server recomputes)', () => {
    const r = invoiceInputSchema.parse({
      ...valid,
      totalAmount: 1,
      lines: [{ productId: 'a', qtyPacks: 1, rate40Kg: 1, amount: 999, commission: 5 }],
    });
    expect(r).not.toHaveProperty('totalAmount');
    expect(r.lines[0]).toEqual({ lineNo: 1, productId: 'a', qtyPacks: 1, rate40Kg: '1' });
  });

  it('header messages', () => {
    expect(messages(invoiceInputSchema.safeParse({ ...valid, invoiceNo: '' }))).toEqual([
      'Enter the Invoice No.',
    ]);
    expect(messages(invoiceInputSchema.safeParse({ ...valid, invoiceDate: '' }))).toEqual([
      'Enter the Invoice Date.',
    ]);
    expect(messages(invoiceInputSchema.safeParse({ ...valid, partyId: undefined }))).toEqual([
      'Enter the Party (Name).',
    ]);
  });

  it('line messages use the grid row number', () => {
    const r = invoiceInputSchema.safeParse({
      ...valid,
      lines: [
        { productId: 'a', qtyPacks: '30', rate40Kg: '8000' },
        { productId: 'b', qtyPacks: '0', rate40Kg: '8000' },
        { productId: 'c', qtyPacks: '2.5', rate40Kg: '-1' },
        { productId: '', qtyPacks: '5', rate40Kg: '100' },
      ],
    });
    expect(messages(r)).toEqual([
      'Line 2: enter Qty (Packs).',
      'Line 3: enter Qty (Packs).',
      'Line 3: enter Rate 40Kg.',
      'Line 4: select a product.',
    ]);
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.'))).toEqual([
      'lines.1.qtyPacks',
      'lines.2.qtyPacks',
      'lines.2.rate40Kg',
      'lines.3.productId',
    ]);
  });

  it('needs at least one product line', () => {
    const r = invoiceInputSchema.safeParse({
      ...valid,
      lines: [{ productId: '', qtyPacks: '', rate40Kg: '' }],
    });
    expect(messages(r)).toEqual(['Enter at least one product line.']);
  });

  it('duplicate products are detected for the soft warning', () => {
    expect(
      findDuplicateProducts([{ productId: 'a' }, { productId: 'b' }, { productId: 'a' }]),
    ).toEqual(['a']);
    expect(findDuplicateProducts([{ productId: 'a' }])).toEqual([]);
  });
});

describe('paymentInputSchema (spec §5.4 validation)', () => {
  it('parses a payment', () => {
    expect(
      paymentInputSchema.parse({
        paymentDate: '2026-09-05',
        partyId: 'p1',
        amount: '250000',
        bankId: '',
        slipNo: ' 123 ',
      }),
    ).toEqual({
      paymentDate: '2026-09-05',
      partyId: 'p1',
      amount: '250000',
      bankId: null,
      slipNo: '123',
      subPartyId: null,
      remarks: null,
    });
  });

  it('VBA messages', () => {
    expect(
      messages(paymentInputSchema.safeParse({ paymentDate: '', partyId: '', amount: '0' })),
    ).toEqual(['Enter a date.', 'Select a party.', 'Enter a valid amount.']);
  });

  it('partial update', () => {
    expect(updatePaymentSchema.parse({ amount: 10 })).toEqual({ amount: '10' });
  });
});
