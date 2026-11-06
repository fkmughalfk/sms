import type { Role } from '@sms/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

// A 1×1 PNG stands in for a slip photo (the owner's slips show account numbers).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Phase O5: payment slips — the office's save at once, a salesman's wait to be confirmed. */
describe('payment slips (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role | 'OTHER', Agent>;
  let party = '';
  let bank = '';

  const upload = (
    agent: Agent,
    details: object,
    allowDuplicate = false,
    file = PNG,
    name = 'slip.png',
  ) =>
    agent
      .post('/api/v1/payment-slips')
      .field('data', JSON.stringify({ details, allowDuplicate }))
      .attach('file', file, name);

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('ADMIN', 'admin@waqar.pk');
    await t.createUser('USER', 'salesman@waqar.pk');
    await t.createUser('USER', 'other@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    as.USER = await t.loginAs('salesman@waqar.pk');
    as.OTHER = await t.loginAs('other@waqar.pk');
    party = (await as.ADMIN.post('/api/v1/parties').send({ name: 'Test Party' }).expect(201)).body
      .id;
    bank = (await as.ADMIN.post('/api/v1/banks').send({ name: 'Meezan' }).expect(201)).body.id;
  });

  afterAll(() => t.close());

  const slip = (extra: object = {}) => ({
    paymentDate: '2026-11-05',
    partyId: party,
    bankId: bank,
    amount: '400000',
    slipNo: 'STAN 727970',
    depositor: 'Muhammad Ali',
    method: 'TRANSFER',
    ...extra,
  });

  let salesmanSlip = '';

  it('the office uploads a slip: it is saved as a payment with the image kept', async () => {
    const res = await upload(as.ADMIN, slip()).expect(201);
    expect(res.body).toMatchObject({ status: 'SAVED', amount: '400000', slipNo: 'STAN 727970' });
    const pay = await t.prisma.payment.findUniqueOrThrow({ where: { id: res.body.paymentId } });
    expect([pay.amount.toString(), pay.slipNo, pay.remarks]).toEqual([
      '400000',
      'STAN 727970',
      'Depositor: Muhammad Ali · transfer (slip)',
    ]);
    const file = await as.ADMIN.get(`/api/v1/payment-slips/${res.body.id}/file`).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
  });

  it('the same bank reference again is caught as a duplicate', async () => {
    const res = await upload(as.ADMIN, slip({ amount: '1' })).expect(409);
    expect(res.body.message).toBe(
      'This looks like a payment already recorded (same bank reference).',
    );
    expect(res.body.duplicates[0]).toMatchObject({ amount: '400000', why: 'same bank reference' });
  });

  it('same party, amount, date and bank is caught too, and can be saved on purpose', async () => {
    await upload(as.ADMIN, slip({ slipNo: null })).expect(409);
    const res = await upload(as.ADMIN, slip({ slipNo: null }), true).expect(201);
    expect(res.body.status).toBe('SAVED');
  });

  it("a salesman's slip waits; nothing is recorded until the office confirms", async () => {
    const before = await t.prisma.payment.count();
    const res = await upload(
      as.USER,
      slip({ slipNo: 'TT263092', amount: '1700000', depositor: 'Mudassar Abbas', method: 'CASH' }),
    ).expect(201);
    salesmanSlip = res.body.id;
    expect(res.body).toMatchObject({ status: 'TO_CONFIRM', paymentId: null });
    expect(await t.prisma.payment.count()).toBe(before);
    await as.USER.post(`/api/v1/payment-slips/${salesmanSlip}/confirm`)
      .send({ details: slip() })
      .expect(403);
  });

  it('salesmen see only their own slips', async () => {
    expect((await as.USER.get('/api/v1/payment-slips').expect(200)).body.data).toHaveLength(1);
    expect((await as.OTHER.get('/api/v1/payment-slips').expect(200)).body.data).toEqual([]);
    await as.OTHER.get(`/api/v1/payment-slips/${salesmanSlip}`).expect(404);
    const all = await as.ADMIN.get('/api/v1/payment-slips?status=TO_CONFIRM').expect(200);
    expect(all.body.data.map((s: { id: string }) => s.id)).toEqual([salesmanSlip]);
    expect(all.body.counts).toMatchObject({ TO_CONFIRM: 1 });
  });

  it('the office corrects and confirms it: it becomes a payment', async () => {
    const res = await as.ADMIN.post(`/api/v1/payment-slips/${salesmanSlip}/confirm`)
      .send({
        details: slip({
          slipNo: 'TT263092',
          amount: '1700000.00',
          depositor: 'Mudassar Abbas',
          method: 'CASH',
        }),
      })
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'SAVED',
      amount: '1700000',
      reviewedBy: { name: 'ADMIN admin@waqar.pk' },
    });
    await as.ADMIN.post(`/api/v1/payment-slips/${salesmanSlip}/confirm`)
      .send({ details: slip() })
      .expect(409);
  });

  it('reject needs a reason; a rejected slip records nothing', async () => {
    const s = (await upload(as.USER, slip({ slipNo: 'X1', amount: '5' })).expect(201)).body;
    await as.ADMIN.post(`/api/v1/payment-slips/${s.id}/reject`).send({ reason: '' }).expect(400);
    const res = await as.ADMIN.post(`/api/v1/payment-slips/${s.id}/reject`)
      .send({ reason: 'Not our account' })
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Not our account',
      paymentId: null,
    });
  });

  it('refuses files that are not a photo or PDF, and bad details', async () => {
    await upload(as.ADMIN, slip({ slipNo: 'Z9' }), false, Buffer.from('hi'), 'slip.txt').expect(
      400,
    );
    const bad = await upload(as.ADMIN, slip({ amount: '0' })).expect(400);
    expect(bad.body.message).toBe('Enter a valid amount.');
  });
});
