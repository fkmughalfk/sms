import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Role } from '@sms/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

/**
 * Phase O3: the owner's 11 pending-orders reports of 04-11-2026 (docs/pending-orders,
 * 43 lines, 32 orders) imported as opening orders, then reproduced by the report:
 * 2,074,920 kg and Rs 538,896,375 still to deliver.
 */
describe('pending orders: opening import and report (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role | 'SALESMAN', Agent>;
  const p = {} as Record<string, string>;
  let pakRice = '';
  let farhan = '';
  const file = readFileSync(
    join(__dirname, '..', '..', '..', 'docs', 'pending-orders', '2026-11-04.csv'),
  );

  const upload = (agent: Agent, dryRun: boolean, mapping: object = {}) =>
    agent
      .post('/api/v1/orders/opening-import')
      .field('dryRun', String(dryRun))
      .field('mapping', JSON.stringify(mapping))
      .attach('file', file, '2026-11-04.csv');

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('SUPER_ADMIN', 'super@waqar.pk');
    await t.createUser('ADMIN', 'admin@waqar.pk');
    as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    const post = async (path: string, body: object) =>
      (await as.ADMIN.post(`/api/v1/${path}`).send(body).expect(201)).body.id as string;
    const rice = await post('categories', { name: 'Rice' });
    const ghee = await post('categories', { name: 'Desi Ghee' });
    let sku = 1;
    const prod = (name: string, unitWeightKg: number, categoryId = rice, packPcs = 1) =>
      post('products', { sku: sku++, name, unitWeightKg, packPcs, categoryId });
    p.platinum25 = await prod('ZAFARANI STEAM PLATINUM 25KG', 25);
    p.platinum20 = await prod('ZAFARANI STEAM PLATINUM 20KG', 20);
    p.platinum10 = await prod('ZAFARANI STEAM PLATINUM 10KG', 10, rice, 4);
    p.platinum5 = await prod('ZAFARANI STEAM PLATINUM 5KG', 5, rice, 8);
    p.gold = await prod('ZAFARANI STEAM GOLD 25KG', 25);
    p.everyday = await prod('ZAFARANI STEAM EVERYDAY 25KG', 25);
    p.shadmani = await prod('ZAFARANI STEAM SHADMANI 25KG', 25);
    p.sella = await prod('ZAFARANI SELLA GOLDEN 25KG', 25);
    p.ghee1 = await prod('DESI GHEE 1KG', 1, ghee, 6);
    p.ghee05 = await prod('DESI GHEE 1/2 KG', 0.5, ghee, 12);
    farhan = await post('salespersons', { name: 'Farhan Khalid' });
    pakRice = await post('parties', { name: 'Pak Rice Traders' });
    await as.SUPER_ADMIN.patch('/api/v1/settings').send({ firstOrderNo: 3211 }).expect(200);

    const salesman = await t.createUser('USER', 'farhan@waqar.pk');
    await t.prisma.user.update({ where: { id: salesman.id }, data: { salespersonId: farhan } });
    as.SALESMAN = await t.loginAs('farhan@waqar.pk');
  });

  afterAll(() => t.close());

  const MAPPING = () => ({
    products: {
      '1121 STEAM|25': p.platinum25,
      '1121 STEAM|10': p.platinum10, // 10 kg bags, packed 4 to an outer
      '1121 STEAM|5': p.platinum5,
      'ALMEIRAH ST|20': p.platinum20,
      'STEAM GOLD|25': p.gold,
      'EVERYDAY|25': p.everyday,
      'SHADMANI|25': p.shadmani,
      '1121 SELLA|25': p.sella,
      'DESI GHEE|1': p.ghee1,
      'DESI GHEE|0.5': p.ghee05,
    },
    parties: {
      'PAK RICE TRD': { action: 'map', partyId: pakRice },
      ...Object.fromEntries(
        [
          'ALI AND CO',
          'ASHFAQ COMMISSION SHOP',
          'ASKARI TRD',
          'HAMDARD TDR',
          'HASSAN ENTERPRISES',
          'IMRAN AND CO',
          'KHAN TRADERS',
          'PAKISTAN TRD',
          'SHALIMAR TRADER',
        ].map((n) => [n, { action: 'create' }]),
      ),
    },
    salespersons: { 'FARHAN SB': { action: 'map', salespersonId: farhan } },
  });

  it('only SUPER_ADMIN may import', async () => {
    await upload(as.ADMIN, true).expect(403);
  });

  it('dry run: lists the names to map (with guesses) and writes nothing', async () => {
    const res = await upload(as.SUPER_ADMIN, true).expect(200);
    expect(res.body).toMatchObject({ dryRun: true, ready: false, created: null });
    const products = res.body.unmatched.products.map(
      (u: { key: string; suggestion: { name: string } | null }) => [
        u.key,
        u.suggestion?.name ?? null,
      ],
    );
    expect(products).toEqual(
      expect.arrayContaining([
        ['STEAM GOLD|25', 'ZAFARANI STEAM GOLD 25KG'],
        ['DESI GHEE|1', 'DESI GHEE 1KG'],
      ]),
    );
    expect(products).toHaveLength(10);
    const parties = res.body.unmatched.parties.map(
      (u: { key: string; suggestion: { name: string } | null }) => [
        u.key,
        u.suggestion?.name ?? null,
      ],
    );
    expect(parties).toContainEqual(['PAK RICE TRD', 'Pak Rice Traders']);
    // FARHAN KHALID matches by name; FARHAN SB needs a decision.
    expect(res.body.unmatched.salespersons).toMatchObject([
      { key: 'FARHAN SB', suggestion: { name: 'Farhan Khalid' } },
    ]);
    expect(await t.prisma.order.count()).toBe(0);
  });

  it('dry run with the mapping: ready, and the file totals reproduce exactly', async () => {
    const res = await upload(as.SUPER_ADMIN, true, MAPPING()).expect(200);
    expect(res.body.problems).toEqual([]);
    expect(res.body).toMatchObject({
      ready: true,
      summary: {
        rows: 43,
        orders: { create: 32, exists: 0, lines: 43 },
        cities: { create: 10 },
        parties: { create: 9 },
        salespersons: { create: 0 },
      },
      mismatches: [],
    });
    expect(res.body.comparison).toEqual([
      { metric: 'Weight remaining (kg)', file: '2074920', computed: '2074920', matches: true },
      { metric: 'Pending amount (Rs)', file: '538896375', computed: '538896375', matches: true },
    ]);
  });

  it('imports: order numbers and dispatched bags kept; packs and ghee converted', async () => {
    const res = await upload(as.SUPER_ADMIN, false, MAPPING()).expect(200);
    expect(res.body.created).toEqual({ orders: 32, lines: 43, parties: 9, aliases: 12 });

    const shalimar = await t.prisma.order.findUniqueOrThrow({
      where: { orderNo: 3092 },
      include: { lines: true, party: true, city: true },
    });
    expect([shalimar.party.name, shalimar.city?.name, shalimar.isOpening, shalimar.status]).toEqual(
      ['SHALIMAR TRADER', 'GILGIT', true, 'PENDING'],
    );
    expect([shalimar.lines[0]!.qtyPacks, shalimar.lines[0]!.openingDispatched]).toEqual([
      6000, 3368,
    ]);

    // Askari 3087: 20 × 10 kg bags = 5 outers of 4; 40 × 5 kg = 5 outers of 8.
    const askari = await t.prisma.order.findUniqueOrThrow({
      where: { orderNo: 3087 },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    expect(askari.lines.map((l) => [l.qtyPacks, l.packPcs, l.rate.toString()])).toEqual([
      [5, 4, '13800'],
      [5, 8, '14000'],
      [200, 1, '12500'],
    ]);

    // The ghee report had no order number: it gets the next one (3211); 60 tins = 10 cartons
    // at 2,550 a tin (63,750 per 25 kg).
    const gheeOrder = await t.prisma.order.findUniqueOrThrow({
      where: { orderNo: 3211 },
      include: { lines: { orderBy: { lineNo: 'asc' } }, party: true },
    });
    expect(gheeOrder.party.name).toBe('ALI AND CO');
    expect(
      gheeOrder.lines.map((l) => [l.qtyPacks, l.basis, l.rate.toString(), l.amount.toString()]),
    ).toEqual([
      [10, 'PER_UNIT', '2550', '153000'],
      [10, 'PER_UNIT', '1450', '174000'],
    ]);
  });

  it('the report reproduces the 04-11-2026 totals, grouped by city', async () => {
    const res = await as.ADMIN.get('/api/v1/orders/pending-report').expect(200);
    expect(res.body.totals).toEqual({
      // 83,226 bags on paper; 10 kg / 5 kg bags and ghee tins count as outers / cartons here.
      pendingPacks: 83016,
      pendingWeightKg: '2074920',
      pendingAmount: '538896375',
    });
    expect(res.body.lastOrderNo).toBe(3211);
    expect(res.body.groups.map((g: { city: string }) => g.city)).toEqual([
      'ATTOCK',
      'BAHRA KO',
      'DINA',
      'FATEH JANG',
      'GHAKUCH',
      'GILGIT',
      'HARIPUR',
      'RAWALPINDI',
      'SAKARDU',
      'WAH CANTT',
    ]);
    const gilgit = res.body.groups.find((g: { city: string }) => g.city === 'GILGIT');
    expect(gilgit.totals).toEqual({
      pendingPacks: 3518,
      pendingWeightKg: '87700',
      pendingAmount: '28520500',
    });
    expect(gilgit.lines.map((l: { orderNo: number }) => l.orderNo)).toEqual([
      3024, 3092, 3115, 3176,
    ]);
  });

  it('filters by party and crop year', async () => {
    const res = await as.ADMIN.get(`/api/v1/orders/pending-report?partyId=${pakRice}`).expect(200);
    expect(res.body.groups.map((g: { city: string }) => g.city)).toEqual(['DINA']);
    expect(res.body.totals.pendingAmount).toBe('430239875');
    const crop = await as.ADMIN.get('/api/v1/orders/pending-report?cropYear=25-26').expect(200);
    expect(
      crop.body.groups.flatMap((g: { lines: { cropYear: string }[] }) =>
        g.lines.map((l) => l.cropYear),
      ),
    ).toEqual(expect.arrayContaining(['2025-2026']));
    expect(
      crop.body.groups
        .flatMap((g: { lines: { cropYear: string }[] }) => g.lines)
        .every((l: { cropYear: string }) => l.cropYear === '2025-2026'),
    ).toBe(true);
  });

  it("a salesman sees his salesperson's lines; unapproved and closed orders are left out", async () => {
    const mine = await as.SALESMAN.get('/api/v1/orders/pending-report').expect(200);
    expect(mine.body.totals.pendingAmount).toBe('538896375'); // every opening order is Farhan's

    const order = await t.prisma.order.findUniqueOrThrow({ where: { orderNo: 3203 } });
    await as.ADMIN.post(`/api/v1/orders/${order.id}/close`).send({ reason: 'test' }).expect(200);
    const after = await as.ADMIN.get('/api/v1/orders/pending-report').expect(200);
    expect(after.body.groups.map((g: { city: string }) => g.city)).not.toContain('RAWALPINDI');
    expect(after.body.totals.pendingAmount).toBe(String(538896375 - 421875));
  });

  it('an opening order keeps its dispatched bags when edited, and cannot drop below them', async () => {
    const o = await t.prisma.order.findUniqueOrThrow({
      where: { orderNo: 3092 },
      include: { lines: true },
    });
    const line = {
      productId: o.lines[0]!.productId,
      cropYear: o.lines[0]!.cropYear,
      qtyPacks: 3000,
    };
    const body = { orderDate: '2026-09-22', partyId: o.partyId, lines: [line] };
    const low = await as.ADMIN.put(`/api/v1/orders/${o.id}`).send(body).expect(400);
    expect(low.body.message).toMatch(/3368 of .* are already dispatched/);
    const ok = await as.ADMIN.put(`/api/v1/orders/${o.id}`)
      .send({ ...body, lines: [{ ...line, qtyPacks: 6500 }] })
      .expect(200);
    expect(ok.body.lines[0]).toMatchObject({
      qtyPacks: 6500,
      dispatchedPacks: 3368,
      pendingPacks: 3132,
    });
  });

  it('running the same file again creates nothing, and the names are remembered', async () => {
    const res = await upload(as.SUPER_ADMIN, true).expect(200);
    expect(res.body.unmatched).toEqual({ products: [], parties: [], salespersons: [] });
    expect(res.body.summary.orders).toEqual({ create: 0, exists: 32, lines: 0 });
    const run = await upload(as.SUPER_ADMIN, false).expect(200);
    expect(run.body.created).toMatchObject({ orders: 0 });
    expect(await t.prisma.order.count()).toBe(32);
  });

  it('reports unreadable rows instead of guessing', async () => {
    const bad = Buffer.from(
      [
        'date,party,orderNo,salesperson,product,kg,cropYear,qty,wt,rate,dispatched',
        '3-Nov-26,KHAN TRADERS,4001,FARHAN SB,1121 STEAM,25,27-27,10,250,11500,0',
        'yesterday,KHAN TRADERS,4002,FARHAN SB,1121 STEAM,25,26-27,10,250,11500,0',
        '3-Nov-26,KHAN TRADERS,4003,FARHAN SB,1121 STEAM,20,26-27,10,200,11500,0',
      ].join('\n'),
    );
    const res = await as.SUPER_ADMIN.post('/api/v1/orders/opening-import')
      .field('dryRun', 'true')
      .attach('file', bad, 'bad.csv')
      .expect(200);
    expect(res.body.ready).toBe(false);
    expect(
      res.body.problems.map((x: { row: number; message: string }) => [x.row, x.message]),
    ).toEqual([
      [3, 'Unreadable date "yesterday".'],
      [2, 'Unreadable crop year "27-27".'],
    ]);
    // 1121 STEAM at 20 kg was never mapped.
    expect(res.body.unmatched.products.map((u: { key: string }) => u.key)).toEqual([
      '1121 STEAM|20',
    ]);
  });
});
