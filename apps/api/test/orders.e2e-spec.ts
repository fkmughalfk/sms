import type { Role } from '@sms/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

/**
 * Orders (orders module, phase O2). Rates come from the rate list in effect (dated 2020,
 * so it is always in the past); figures follow the owner's 04-11-2026 list.
 */
describe('orders (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role | 'SALESMAN' | 'OTHER', Agent>;
  const id = {} as Record<
    | 'rice'
    | 'pulses'
    | 'ghee'
    | 'spices'
    | 'platinum'
    | 'moong'
    | 'gheeTin'
    | 'cumin'
    | 'party'
    | 'otherParty'
    | 'arslan'
    | 'city'
    | 'farhan'
    | 'list',
    string
  >;

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('SUPER_ADMIN', 'super@waqar.pk');
    await t.createUser('ADMIN', 'admin@waqar.pk');
    as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');

    const post = async (path: string, body: object) =>
      (await as.ADMIN.post(`/api/v1/${path}`).send(body).expect(201)).body.id as string;
    id.rice = await post('categories', { name: 'Rice' });
    id.pulses = await post('categories', { name: 'Pulses' });
    id.ghee = await post('categories', { name: 'Desi Ghee' });
    id.spices = await post('categories', { name: 'Spices' });
    id.platinum = await post('products', {
      sku: 1,
      name: 'ZAFARANI STEAM PLATINUM 25KG',
      unitWeightKg: 25,
      categoryId: id.rice,
    });
    id.moong = await post('products', {
      sku: 38,
      name: 'DAAL MOONG 25KG',
      unitWeightKg: 25,
      categoryId: id.pulses,
    });
    id.gheeTin = await post('products', {
      sku: 44,
      name: 'DESI GHEE 1KG',
      unitWeightKg: 1,
      packPcs: 6,
      categoryId: id.ghee,
    });
    id.cumin = await post('products', {
      sku: 71,
      name: 'CUMIN 5.5KG',
      unitWeightKg: 5.5,
      categoryId: id.spices,
    });
    id.city = await post('cities', { name: 'Rawalpindi' });
    id.farhan = await post('salespersons', { name: 'Farhan Khalid' });
    id.party = await post('parties', {
      name: 'Ashfaq Commission Shop',
      cityId: id.city,
      salespersonId: id.farhan,
    });
    id.otherParty = await post('parties', { name: 'Khan Traders' });
    id.arslan = await post('sub-parties', { name: 'Arslan Dar', partyId: id.party });

    id.list = await post('rate-lists', {
      effectiveFrom: '2020-01-01T09:00',
      items: [
        { productId: id.platinum, cropYear: '25-26', basis: 'PER_40KG', rate: '13500' },
        { productId: id.platinum, cropYear: '26-27', basis: 'PER_40KG', rate: '11500' },
        { productId: id.moong, basis: 'PER_40KG', rate: '10250' },
        { productId: id.gheeTin, basis: 'PER_UNIT', rate: '2550' },
        { productId: id.cumin, basis: 'PER_UNIT', rate: '', isAvailable: false },
      ],
    });

    // A salesman linked to Farhan, and another salesman.
    const salesman = await t.createUser('USER', 'farhan@waqar.pk');
    await t.prisma.user.update({ where: { id: salesman.id }, data: { salespersonId: id.farhan } });
    await t.createUser('USER', 'other@waqar.pk');
    as.SALESMAN = await t.loginAs('farhan@waqar.pk');
    as.OTHER = await t.loginAs('other@waqar.pk');
    as.USER = as.SALESMAN;
  });

  afterAll(() => t.close());

  const order = (lines: object[], extra: object = {}) => ({
    orderDate: '2026-11-04',
    partyId: id.party,
    cityId: id.city,
    salespersonId: id.farhan,
    lines,
    ...extra,
  });

  let officeOrder = '';
  let salesmanOrder = '';

  it('numbers orders from the first order no. in Settings', async () => {
    expect((await as.ADMIN.get('/api/v1/orders/next-number').expect(200)).body).toEqual({
      orderNo: 1,
    });
    await as.SUPER_ADMIN.patch('/api/v1/settings').send({ firstOrderNo: 3211 }).expect(200);
    expect((await as.ADMIN.get('/api/v1/orders/next-number').expect(200)).body).toEqual({
      orderNo: 3211,
    });
  });

  it('the office books at list rates; the order is pending straight away', async () => {
    const res = await as.ADMIN.post('/api/v1/orders')
      .send(
        order(
          [
            { productId: id.platinum, cropYear: '25-26', qtyPacks: 150 },
            { productId: id.moong, qtyPacks: 30 },
            { productId: id.gheeTin, qtyPacks: 10 },
          ],
          {
            subPartyId: id.arslan,
            discounts: [
              { categoryId: id.rice, amount: '100' },
              { categoryId: id.pulses, amount: '50' },
              { categoryId: id.ghee, amount: '5' },
              { categoryId: id.spices, amount: '0' },
            ],
          },
        ),
      )
      .expect(201);
    officeOrder = res.body.id;
    expect(res.body).toMatchObject({
      orderNo: 3211,
      status: 'PENDING',
      totalPacks: 190,
      totalWeightKg: '4560',
      // 150 × 8,437.5 + 30 × 6,406.25 (192,187.5 → 192,187) + 10 cartons × 6 × 2,550
      totalAmount: '1610812',
      rateList: { id: id.list, effectiveFrom: '2020-01-01T09:00' },
      subParty: { id: id.arslan, name: 'Arslan Dar' },
    });
    expect(
      res.body.lines.map((l: Record<string, unknown>) => [
        l.cropYear,
        l.basis,
        l.listRate,
        l.rate,
        l.ratePerPack,
        l.amount,
        l.weightKg,
        l.pendingPacks,
      ]),
    ).toEqual([
      ['2025-2026', 'PER_40KG', '13500', '13500', '8437.5', '1265625', '3750', 150],
      [null, 'PER_40KG', '10250', '10250', '6406.25', '192187', '750', 30],
      [null, 'PER_UNIT', '2550', '2550', '15300', '153000', '60', 10],
    ]);
    expect(
      res.body.discounts.map((d: { category: { name: string }; unit: string; amount: string }) => [
        d.category.name,
        d.unit,
        d.amount,
      ]),
    ).toEqual([
      ['Desi Ghee', 'PER_KG', '5'],
      ['Pulses', 'PER_40KG', '50'],
      ['Rice', 'PER_40KG', '100'],
    ]);
  });

  it("a salesman's order waits for approval and always takes the list rate", async () => {
    const res = await as.SALESMAN.post('/api/v1/orders')
      .send(
        order([
          { productId: id.platinum, cropYear: '2026-2027', qtyPacks: 100, rate: '9000' },
          { productId: id.moong, qtyPacks: 2, amount: '1' },
        ]),
      )
      .expect(201);
    salesmanOrder = res.body.id;
    expect(res.body).toMatchObject({ orderNo: 3212, status: 'SUBMITTED' });
    expect(res.body.lines.map((l: { rate: string; amount: string }) => [l.rate, l.amount])).toEqual(
      [
        ['11500', '718750'],
        ['10250', '12812'], // 12,812.5 → half rupee down
      ],
    );
  });

  it('items that are N/A or missing from the list: salesman refused, office may set a rate', async () => {
    const na = await as.SALESMAN.post('/api/v1/orders')
      .send(order([{ productId: id.cumin, qtyPacks: 2 }]))
      .expect(400);
    expect(na.body.message).toBe('Line 1: CUMIN 5.5KG is not on sale on the current rate list.');

    const noRate = await as.ADMIN.post('/api/v1/orders')
      .send(order([{ productId: id.platinum, cropYear: '24-25', qtyPacks: 1 }]))
      .expect(400);
    expect(noRate.body.message).toMatch(/2024-2025\) is not on sale.*enter a rate/);

    const res = await as.ADMIN.post('/api/v1/orders')
      .send(order([{ productId: id.cumin, qtyPacks: 2, rate: '6550' }]))
      .expect(201);
    expect(res.body.lines[0]).toMatchObject({ listRate: null, rate: '6550', amount: '13100' });
    await as.ADMIN.post(`/api/v1/orders/${res.body.id}/cancel`)
      .send({ reason: 'test' })
      .expect(200);
  });

  it('refuses a duplicate line and a sub-party of another party', async () => {
    const dup = await as.ADMIN.post('/api/v1/orders')
      .send(
        order([
          { productId: id.moong, qtyPacks: 1 },
          { productId: id.moong, qtyPacks: 2 },
        ]),
      )
      .expect(400);
    expect(dup.body.message).toBe('This product and crop year is already on line 1.');
    const sub = await as.ADMIN.post('/api/v1/orders')
      .send(
        order([{ productId: id.moong, qtyPacks: 1 }], {
          partyId: id.otherParty,
          subPartyId: id.arslan,
        }),
      )
      .expect(400);
    expect(sub.body.message).toBe('Select a sub-party of this party.');
  });

  it("salesmen see their own and their salesperson's orders only", async () => {
    const mine = await as.SALESMAN.get('/api/v1/orders').expect(200);
    // Own order + the office's order for Farhan's party.
    expect(mine.body.data.map((o: { orderNo: number }) => o.orderNo).sort()).toEqual(
      expect.arrayContaining([3211, 3212]),
    );
    const other = await as.OTHER.get('/api/v1/orders').expect(200);
    expect(other.body.data).toEqual([]);
    await as.OTHER.get(`/api/v1/orders/${salesmanOrder}`).expect(404);
    const all = await as.ADMIN.get('/api/v1/orders?status=SUBMITTED').expect(200);
    expect(all.body.data.map((o: { id: string }) => o.id)).toEqual([salesmanOrder]);
  });

  it('editing keeps booked rates; new lines take the rate list in force now', async () => {
    // The market moves: a newer list prices moong at 11,000.
    const newer = await as.ADMIN.post('/api/v1/rate-lists')
      .send({
        effectiveFrom: '2020-06-01T09:00',
        items: [
          { productId: id.platinum, cropYear: '26-27', basis: 'PER_40KG', rate: '12000' },
          { productId: id.moong, basis: 'PER_40KG', rate: '11000' },
          { productId: id.gheeTin, basis: 'PER_UNIT', rate: '2600' },
        ],
      })
      .expect(201);

    const res = await as.SALESMAN.put(`/api/v1/orders/${salesmanOrder}`)
      .send(
        order([
          { productId: id.platinum, cropYear: '26-27', qtyPacks: 120 },
          { productId: id.moong, qtyPacks: 2 },
          { productId: id.gheeTin, qtyPacks: 1 },
        ]),
      )
      .expect(200);
    expect(
      res.body.lines.map((l: { rate: string; qtyPacks: number }) => [l.rate, l.qtyPacks]),
    ).toEqual([
      ['11500', 120], // booked before the change
      ['10250', 2], // booked before the change
      ['2600', 1], // added now
    ]);
    expect(res.body.rateList.id).toBe(newer.body.id);
    expect(res.body.status).toBe('SUBMITTED');
  });

  it('only the office approves; after approval the salesman can no longer edit', async () => {
    await as.SALESMAN.post(`/api/v1/orders/${salesmanOrder}/approve`).expect(403);
    const ok = await as.ADMIN.post(`/api/v1/orders/${salesmanOrder}/approve`).expect(200);
    expect(ok.body).toMatchObject({
      status: 'PENDING',
      reviewedBy: { name: 'ADMIN admin@waqar.pk' },
    });
    const edit = await as.SALESMAN.put(`/api/v1/orders/${salesmanOrder}`)
      .send(order([{ productId: id.moong, qtyPacks: 5 }]))
      .expect(403);
    expect(edit.body.message).toMatch(/has been approved; ask the office/);
    await as.ADMIN.post(`/api/v1/orders/${salesmanOrder}/approve`).expect(409);
    // The office can still re-price it.
    const repriced = await as.ADMIN.put(`/api/v1/orders/${salesmanOrder}`)
      .send(order([{ productId: id.moong, qtyPacks: 2, rate: '10000' }]))
      .expect(200);
    expect(repriced.body.lines[0]).toMatchObject({
      rate: '10000',
      listRate: '10250',
      amount: '12500',
    });
  });

  it('reject needs a reason; a salesman can withdraw only their own unapproved order', async () => {
    const a = await as.SALESMAN.post('/api/v1/orders')
      .send(order([{ productId: id.moong, qtyPacks: 1 }]))
      .expect(201);
    await as.ADMIN.post(`/api/v1/orders/${a.body.id}/reject`).send({ reason: ' ' }).expect(400);
    const rejected = await as.ADMIN.post(`/api/v1/orders/${a.body.id}/reject`)
      .send({ reason: 'Party has not paid' })
      .expect(200);
    expect(rejected.body).toMatchObject({ status: 'REJECTED', statusReason: 'Party has not paid' });

    const b = await as.SALESMAN.post('/api/v1/orders')
      .send(order([{ productId: id.moong, qtyPacks: 1 }]))
      .expect(201);
    expect(
      (
        await as.SALESMAN.post(`/api/v1/orders/${b.body.id}/cancel`)
          .send({ reason: 'Party changed mind' })
          .expect(200)
      ).body.status,
    ).toBe('CANCELLED');
    // Not the office's pending order.
    await as.SALESMAN.post(`/api/v1/orders/${officeOrder}/cancel`)
      .send({ reason: 'x' })
      .expect(403);
  });

  it('the office closes a pending order; a closed order cannot change', async () => {
    const res = await as.ADMIN.post(`/api/v1/orders/${officeOrder}/close`)
      .send({ reason: 'Party cancelled the rest' })
      .expect(200);
    expect(res.body.status).toBe('CLOSED');
    await as.ADMIN.put(`/api/v1/orders/${officeOrder}`)
      .send(order([{ productId: id.moong, qtyPacks: 5 }]))
      .expect(409);
    await as.ADMIN.post(`/api/v1/orders/${officeOrder}/cancel`).send({ reason: 'x' }).expect(409);
  });

  it('every change is audited', async () => {
    const entries = await t.prisma.auditLog.findMany({
      where: { entity: 'Order', entityId: salesmanOrder },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((e) => e.action)).toEqual(['CREATE', 'UPDATE', 'UPDATE', 'UPDATE']);
  });

  it('a rate list or party that orders use cannot be deleted', async () => {
    const list = await as.ADMIN.delete(`/api/v1/rate-lists/${id.list}`).expect(409);
    expect(list.body.message).toMatch(/order\(s\) were booked from this list/);
    const party = await as.ADMIN.delete(`/api/v1/parties/${id.party}`).expect(409);
    expect(party.body.message).toMatch(/order/);
  });
});
