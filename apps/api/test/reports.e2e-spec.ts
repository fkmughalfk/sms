import type { Role } from '@sms/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

/**
 * Hand-worked dashboard (spec §13 phase 6). Fiscal year = calendar 2026 (start month 1).
 * Annual target 12,000,000 → monthly 1,000,000.
 *
 *   #15  2026-09-02  Pak Rice Traders  Dina     Farhan  golden: 1,272,188 · comm 4,452.658 · 200 bags · 5,000 KG
 *   #16  2026-10-01  Tayyab Traders    Chakwal  Ali     Rice 10 × 40 KG @5,000: 50,000 · comm 250 · 10 bags · 400 KG
 *   #19  2026-09-15  Tayyab Traders    —        —       (by USER) Masar 2 × 25 KG: 10,000 · comm 35 · 2 bags · 50 KG
 *   #17  2025-12-31  outside the fiscal year → excluded
 *   #18  2026-09-20  deleted → excluded
 *   Payments: PRT 272,188 (2026-09-05) · Tayyab 20,000 (2026-10-02) · PRT 1,000 (2025-12-30, excluded)
 *
 *   Revenue 1,332,188 · Commission 4,737.658 · 212 bags · 5,450 KG (5.45 t) · 3 invoices
 *   Recovered 292,188 · Outstanding 1,040,000 · Remaining to target 10,667,812
 */
describe('reports & dashboard (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role, Agent>;
  const ids: Record<string, string> = {};
  let userId = '';
  const FY = 'from=2026-01-01&to=2026-12-31';

  const GOLDEN: [string, number, number][] = [
    ['MASAR SABIT 25KG', 30, 8000],
    ['DAAL MASH CHARI 25KG', 20, 16250],
    ['DAAL MOONG 25KG', 30, 10250],
    ['DALL MASOOR 25KG', 20, 8400],
    ['DAAL CHANNA SUPREME 25KG', 100, 9950],
  ];

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('ADMIN', 'admin@waqar.pk');
    userId = (await t.createUser('USER', 'user@waqar.pk')).id;
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    as.USER = await t.loginAs('user@waqar.pk');

    const p = t.prisma;
    await p.setting.update({
      where: { id: 1 },
      data: {
        annualSalesTarget: '12000000',
        defaultCommissionRate: '0.0035',
        fiscalYearStartMonth: 1,
      },
    });
    const pulses = await p.category.create({ data: { name: 'Pulses' } });
    const rice = await p.category.create({ data: { name: 'Rice', commissionRate: '0.005' } });
    ids.pulses = pulses.id;
    ids.riceCat = rice.id;
    let sku = 1;
    for (const [name] of GOLDEN) {
      ids[name] = (
        await p.product.create({
          data: { sku: sku++, name, unitWeightKg: 25, categoryId: pulses.id },
        })
      ).id;
    }
    ids.rice = (
      await p.product.create({
        data: {
          sku: 50,
          name: 'ZAFARANI 10KG x 4',
          unitWeightKg: 10,
          packPcs: 4,
          categoryId: rice.id,
        },
      })
    ).id;
    ids.dina = (await p.city.create({ data: { name: 'Dina' } })).id;
    ids.chakwal = (await p.city.create({ data: { name: 'Chakwal' } })).id;
    ids.prt = (await p.party.create({ data: { name: 'Pak Rice Traders' } })).id;
    ids.tayyab = (await p.party.create({ data: { name: 'Tayyab Traders' } })).id;
    ids.farhan = (await p.salesperson.create({ data: { name: 'Farhan Khalid' } })).id;
    ids.ali = (await p.salesperson.create({ data: { name: 'Ali' } })).id;

    const post = (agent: Agent, body: object) =>
      agent.post('/api/v1/invoices').send(body).expect(201);
    await post(as.ADMIN, {
      invoiceNo: 15,
      invoiceDate: '2026-09-02',
      partyId: ids.prt,
      cityId: ids.dina,
      salespersonId: ids.farhan,
      lines: GOLDEN.map(([n, q, r]) => ({ productId: ids[n], qtyPacks: q, rate40Kg: r })),
    });
    await post(as.ADMIN, {
      invoiceNo: 16,
      invoiceDate: '2026-10-01',
      partyId: ids.tayyab,
      cityId: ids.chakwal,
      salespersonId: ids.ali,
      lines: [{ productId: ids.rice, qtyPacks: 10, rate40Kg: 5000 }],
    });
    await post(as.USER, {
      invoiceNo: 19,
      invoiceDate: '2026-09-15',
      partyId: ids.tayyab,
      lines: [{ productId: ids['MASAR SABIT 25KG'], qtyPacks: 2, rate40Kg: 8000 }],
    });
    await post(as.ADMIN, {
      invoiceNo: 17,
      invoiceDate: '2025-12-31',
      partyId: ids.prt,
      lines: [{ productId: ids['MASAR SABIT 25KG'], qtyPacks: 1, rate40Kg: 8000 }],
    });
    const deleted = await post(as.ADMIN, {
      invoiceNo: 18,
      invoiceDate: '2026-09-20',
      partyId: ids.prt,
      lines: [{ productId: ids['MASAR SABIT 25KG'], qtyPacks: 100, rate40Kg: 8000 }],
    });
    await as.ADMIN.delete(`/api/v1/invoices/${deleted.body.id}`).expect(204);

    const pay = (body: object) => as.ADMIN.post('/api/v1/payments').send(body).expect(201);
    await pay({ paymentDate: '2026-09-05', partyId: ids.prt, amount: '272188' });
    await pay({ paymentDate: '2026-10-02', partyId: ids.tayyab, amount: '20000' });
    await pay({ paymentDate: '2025-12-30', partyId: ids.prt, amount: '1000' });
  });

  afterAll(() => t.close());

  it('dashboard KPIs, target and recovery match the hand calculation', async () => {
    const res = await as.ADMIN.get(`/api/v1/reports/dashboard?${FY}`).expect(200);
    expect(res.body).toEqual({
      period: { from: '2026-01-01', to: '2026-12-31' },
      scoped: false,
      kpis: {
        revenue: '1332188',
        commission: '4737.658',
        commissionPct: expect.stringMatching(/^0\.003556/),
        weightKg: '5450',
        tons: '5.45',
        invoices: 3,
        packs: 212,
        avgPerTon: '244438.17', // 1,332,188 ÷ 5.45
        avgPerPack: '6283.91', // 1,332,188 ÷ 212
      },
      target: {
        annualTarget: '12000000',
        actual: '1332188',
        achieved: expect.stringMatching(/^0\.11101566/),
        remaining: '10667812',
        monthlyTarget: '1000000',
      },
      recovery: {
        recovered: '292188',
        outstanding: '1040000',
        recoveryRate: expect.stringMatching(/^0\.219329/), // 292,188 ÷ 1,332,188
        payments: 2,
      },
    });
  });

  it('defaults to the current fiscal year', async () => {
    const res = await as.ADMIN.get('/api/v1/reports/dashboard').expect(200);
    expect(res.body.period.from).toMatch(/^\d{4}-01-01$/);
    expect(res.body.period.to).toMatch(/^\d{4}-12-31$/);
  });

  it('a custom period narrows everything', async () => {
    const res = await as.ADMIN.get(
      '/api/v1/reports/dashboard?from=2026-10-01&to=2026-10-31',
    ).expect(200);
    expect(res.body.kpis).toMatchObject({ revenue: '50000', invoices: 1, packs: 10 });
    expect(res.body.recovery).toMatchObject({
      recovered: '20000',
      outstanding: '30000',
      payments: 1,
    });
  });

  it('sales by category (Rice vs Pulses)', async () => {
    const res = await as.ADMIN.get(`/api/v1/reports/by-category?${FY}`).expect(200);
    expect(res.body.data).toEqual([
      {
        id: ids.pulses,
        name: 'Pulses',
        packs: 202,
        weightKg: '5050',
        amount: '1282188',
        commission: '4487.658',
        pctOfSales: expect.stringMatching(/^0\.96246/),
      },
      {
        id: ids.riceCat,
        name: 'Rice',
        packs: 10,
        weightKg: '400',
        amount: '50000',
        commission: '250',
        pctOfSales: expect.stringMatching(/^0\.03753/),
      },
    ]);
    expect(res.body.totals).toEqual({
      packs: 212,
      weightKg: '5450',
      amount: '1332188',
      commission: '4737.658',
    });
  });

  it('sales by salesperson and by city include an "unassigned" bucket', async () => {
    const asm = await as.ADMIN.get(`/api/v1/reports/by-salesperson?${FY}`).expect(200);
    expect(asm.body.data.map((r: { name: string; amount: string }) => [r.name, r.amount])).toEqual([
      ['Farhan Khalid', '1272188'],
      ['Ali', '50000'],
      ['Unassigned', '10000'],
    ]);
    const city = await as.ADMIN.get(`/api/v1/reports/by-city?${FY}`).expect(200);
    expect(city.body.data.map((r: { name: string; amount: string }) => [r.name, r.amount])).toEqual(
      [
        ['Dina', '1272188'],
        ['Chakwal', '50000'],
        ['No city', '10000'],
      ],
    );
  });

  it('sales by product, sorted by amount, with category', async () => {
    const res = await as.ADMIN.get(`/api/v1/reports/by-product?${FY}`).expect(200);
    expect(
      res.body.data.map((r: { name: string; amount: string; packs: number; category: string }) => [
        r.name,
        r.amount,
        r.packs,
        r.category,
      ]),
    ).toEqual([
      ['DAAL CHANNA SUPREME 25KG', '621875', 100, 'Pulses'],
      ['DAAL MASH CHARI 25KG', '203125', 20, 'Pulses'],
      ['DAAL MOONG 25KG', '192188', 30, 'Pulses'],
      ['MASAR SABIT 25KG', '160000', 32, 'Pulses'], // 150,000 on #15 + 10,000 on #19
      ['DALL MASOOR 25KG', '105000', 20, 'Pulses'],
      ['ZAFARANI 10KG x 4', '50000', 10, 'Rice'],
    ]);
  });

  it('recovery by party (period figures)', async () => {
    const res = await as.ADMIN.get(`/api/v1/reports/by-party?${FY}`).expect(200);
    expect(
      res.body.data.map((r: Record<string, string>) => [
        r.name,
        r.amount,
        r.recovered,
        r.outstanding,
        r.lastPaymentDate,
      ]),
    ).toEqual([
      ['Pak Rice Traders', '1272188', '272188', '1000000', '2026-09-05'],
      ['Tayyab Traders', '60000', '20000', '40000', '2026-10-02'],
    ]);
    expect(res.body.recoveryTotals).toEqual({ recovered: '292188', outstanding: '1040000' });
  });

  it('monthly trend is zero-filled; daily trend covers each day', async () => {
    const month = await as.ADMIN.get(`/api/v1/reports/trend?${FY}&granularity=month`).expect(200);
    expect(month.body.points).toHaveLength(12);
    expect(month.body.monthlyTarget).toBe('1000000');
    const sep = month.body.points.find((p: { period: string }) => p.period === '2026-09');
    expect(sep).toEqual({
      period: '2026-09',
      amount: '1282188',
      commission: '4487.658',
      weightKg: '5050',
      packs: 202,
      invoices: 2,
    });
    expect(month.body.points.find((p: { period: string }) => p.period === '2026-01').amount).toBe(
      '0',
    );

    const day = await as.ADMIN.get(
      '/api/v1/reports/trend?from=2026-09-01&to=2026-09-05&granularity=day',
    ).expect(200);
    expect(
      day.body.points.map((p: { period: string; amount: string }) => [p.period, p.amount]),
    ).toEqual([
      ['2026-09-01', '0'],
      ['2026-09-02', '1272188'],
      ['2026-09-03', '0'],
      ['2026-09-04', '0'],
      ['2026-09-05', '0'],
    ]);
  });

  describe('USER scope (spec §3 note **)', () => {
    it('an unlinked USER sees only invoices and payments they entered', async () => {
      const res = await as.USER.get(`/api/v1/reports/dashboard?${FY}`).expect(200);
      expect(res.body.scoped).toBe(true);
      expect(res.body.kpis).toMatchObject({ revenue: '10000', invoices: 1, packs: 2 });
      expect(res.body.recovery).toMatchObject({ recovered: '0', payments: 0 });
      const products = await as.USER.get(`/api/v1/reports/by-product?${FY}`).expect(200);
      expect(products.body.data.map((r: { name: string }) => r.name)).toEqual(['MASAR SABIT 25KG']);
    });

    it('a USER linked to a salesperson also sees that salesperson’s sales', async () => {
      await t.prisma.user.update({ where: { id: userId }, data: { salespersonId: ids.ali } });
      const res = await as.USER.get(`/api/v1/reports/dashboard?${FY}`).expect(200);
      expect(res.body.kpis).toMatchObject({ revenue: '60000', invoices: 2 });
      await t.prisma.user.update({ where: { id: userId }, data: { salespersonId: null } });
    });
  });

  it('reports need a session', async () => {
    await request(t.app.getHttpServer()).get('/api/v1/reports/dashboard').expect(401);
  });
});
