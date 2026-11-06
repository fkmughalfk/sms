import type { Role } from '@sms/shared';
import request from 'supertest';
import { invoiceItems, pdfFromItems } from './pdf-from-items';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

/**
 * Phase O6: an order carries Rs 100 per 40 kg off rice. Invoice 706 (100 × 25 kg @ 13,500 =
 * 843,750) delivers it, so it can earn 2,500 kg ÷ 40 × 100 = 6,250 if cleared within 30 days.
 */
describe('prompt-payment discount (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role, Agent>;
  let party = '';
  let invoiceId = '';

  const position = async () =>
    (await as.ADMIN.get(`/api/v1/recovery/parties/${party}/position`).expect(200)).body as {
      recovered: string;
      outstanding: string;
    };
  const credits = async () =>
    (await as.ADMIN.get(`/api/v1/discounts?partyId=${party}`).expect(200)).body as {
      credits: { id: string; amount: string; creditDate: string; status: string }[];
      eligible: { invoiceNo: number; discount: string; payBy: string }[];
    };
  const pay = async (paymentDate: string, amount: string) =>
    (
      await as.ADMIN.post('/api/v1/payments')
        .send({ paymentDate, partyId: party, amount })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('ADMIN', 'admin@waqar.pk');
    await t.createUser('USER', 'user@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    as.USER = await t.loginAs('user@waqar.pk');
    const post = async (path: string, body: object) =>
      (await as.ADMIN.post(`/api/v1/${path}`).send(body).expect(201)).body.id as string;
    const rice = await post('categories', { name: 'Rice' });
    const platinum = await post('products', {
      sku: 1,
      name: 'ZAFARANI STEAM PLATINUM 25KG',
      unitWeightKg: 25,
      categoryId: rice,
    });
    party = await post('parties', { name: 'Alpha Commission Shop' });
    await post('orders', {
      orderDate: '2026-11-01',
      partyId: party,
      lines: [{ productId: platinum, cropYear: '25-26', qtyPacks: 150, rate: '13500' }],
      discounts: [{ categoryId: rice, amount: '100' }],
    });
    const [row] = (
      await as.ADMIN.post('/api/v1/invoice-pdfs')
        .attach('files', pdfFromItems(invoiceItems('ashfaq')), 'ashfaq.pdf')
        .expect(201)
    ).body;
    await as.ADMIN.post(`/api/v1/invoice-pdfs/${row.id}/resolve`)
      .send({ resolution: { lines: { '1': { productId: platinum } } }, post: true })
      .expect(200);
    invoiceId = (await t.prisma.invoice.findFirstOrThrow({ where: { invoiceNo: 706 } })).id;
  });

  afterAll(() => t.close());

  it('the invoice carries the order discount and the credit days', async () => {
    const inv = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect([inv.promptDiscount.toString(), inv.creditDays]).toEqual(['6250', 30]);
    expect((await credits()).eligible).toEqual([
      expect.objectContaining({ invoiceNo: 706, discount: '6250', payBy: '2026-12-03' }),
    ]);
  });

  it('paying the discounted amount on time credits the discount automatically', async () => {
    await pay('2026-11-20', '837500');
    const c = await credits();
    expect(c.credits).toEqual([
      expect.objectContaining({ amount: '6250', creditDate: '2026-11-20', status: 'ACTIVE' }),
    ]);
    expect(c.eligible).toEqual([]);
    expect(await position()).toMatchObject({ outstanding: '0' });
  });

  it('the ledger shows the discount as a credit after the payment', async () => {
    const l = await as.ADMIN.get(`/api/v1/recovery/parties/${party}/ledger`).expect(200);
    expect(
      l.body.entries.map((e: { type: string; credit: string; balance: string }) => [
        e.type,
        e.credit,
        e.balance,
      ]),
    ).toEqual([
      ['INVOICE', '0', '843750'],
      ['PAYMENT', '837500', '6250'],
      ['DISCOUNT', '6250', '0'],
    ]);
  });

  it('deleting the payment takes the discount back', async () => {
    const id = (await t.prisma.payment.findFirstOrThrow({ where: { partyId: party } })).id;
    await as.ADMIN.delete(`/api/v1/payments/${id}`).expect(204);
    expect((await credits()).credits).toEqual([]);
    expect(await position()).toMatchObject({ outstanding: '843750' });
  });

  it('part on time, the rest late: no discount', async () => {
    await pay('2026-11-10', '500000');
    await pay('2026-12-10', '337500');
    expect((await credits()).credits).toEqual([]);
    expect(await position()).toMatchObject({ outstanding: '6250' });
    for (const p of await t.prisma.payment.findMany({ where: { partyId: party } })) {
      await as.ADMIN.delete(`/api/v1/payments/${p.id}`).expect(204);
    }
  });

  it('the office can reverse a credit; it is not credited again', async () => {
    await pay('2026-11-25', '837500');
    const [c] = (await credits()).credits;
    await as.USER.post(`/api/v1/discounts/${c!.id}/reverse`).send({ reason: 'x' }).expect(403);
    await as.ADMIN.post(`/api/v1/discounts/${c!.id}/reverse`).send({ reason: '' }).expect(400);
    const res = await as.ADMIN.post(`/api/v1/discounts/${c!.id}/reverse`)
      .send({ reason: 'Paid by a post-dated cheque' })
      .expect(200);
    expect(res.body.credits).toEqual([
      expect.objectContaining({ status: 'REVERSED', reversedBy: 'ADMIN admin@waqar.pk' }),
    ]);
    expect(await position()).toMatchObject({ outstanding: '6250' });
    // Another payment doesn't bring it back.
    await pay('2026-11-26', '1');
    expect((await credits()).credits.map((x) => x.status)).toEqual(['REVERSED']);
  });

  it('every automatic change is audited', async () => {
    const actions = (await t.prisma.auditLog.findMany({ where: { entity: 'DiscountCredit' } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['CREATE', 'DELETE', 'UPDATE']));
  });
});
