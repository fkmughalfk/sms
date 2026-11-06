import type { Role } from '@sms/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

/**
 * docs/COMMISSION_SPEC.md: Farhan earns on every sale (rice 0.35%, pulses 0.25%, ghee and
 * spices 0.35%); Arslan Dar takes 0.15% out of it on his parties and his sub-party.
 * Lines are Rs 100,000 (10 bags × 25 kg at 16,000 per 40 kg).
 */
describe('commission (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role, Agent>;
  const id = {} as Record<string, string>;
  let invoiceNo = 1;

  const invoice = async (partyId?: string, productId?: string, extra: object = {}) =>
    (
      await as.ADMIN.post('/api/v1/invoices')
        .send({
          invoiceNo: invoiceNo++,
          invoiceDate: '2026-11-05',
          partyId,
          lines: [{ productId, qtyPacks: 10, rate40Kg: '16000' }],
          ...extra,
        })
        .expect(201)
    ).body.id as string;
  const rows = async (invoiceId: string) =>
    (
      await t.prisma.invoiceLineCommission.findMany({
        where: { invoiceLine: { invoiceId } },
        include: { salesperson: true },
        orderBy: { basis: 'asc' },
      })
    ).map((r) => [r.salesperson.name, r.basis, r.amount.toString()]);

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('SUPER_ADMIN', 'super@waqar.pk');
    await t.createUser('ADMIN', 'admin@waqar.pk');
    as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    const post = async (path: string, body: object) =>
      (await as.ADMIN.post(`/api/v1/${path}`).send(body).expect(201)).body.id as string;
    for (const c of ['Rice', 'Pulses', 'Desi Ghee', 'Spices'])
      id[c] = await post('categories', { name: c });
    id.riceProduct = await post('products', {
      sku: 1,
      name: 'RICE 25KG',
      unitWeightKg: 25,
      categoryId: id.Rice,
    });
    id.pulsesProduct = await post('products', {
      sku: 2,
      name: 'PULSES 25KG',
      unitWeightKg: 25,
      categoryId: id.Pulses,
    });
    id.farhan = await post('salespersons', { name: 'Farhan Khalid' });
    id.ali = await post('salespersons', { name: 'Ali' });
    id.arslan = await post('salespersons', { name: 'Arslan Dar' });
    id.aliParty = await post('parties', { name: 'Ali Party', salespersonId: id.ali });
    id.arslanParty = await post('parties', { name: 'Arslan Party', salespersonId: id.arslan });
    id.arslanSub = await post('sub-parties', { name: 'Arslan Dar', partyId: id.aliParty });
  });

  afterAll(() => t.close());

  const RULES = () => ({
    overrider: {
      salespersonId: id.farhan,
      rates: [
        { categoryId: id.Rice, rate: '0.0035' },
        { categoryId: id.Pulses, rate: '0.0025' },
        { categoryId: id['Desi Ghee'], rate: '0.0035' },
        { categoryId: id.Spices, rate: '0.0035' },
      ],
    },
    shares: [
      { earnerId: id.arslan, matchPartySalespersonId: id.arslan, rate: '0.0015' },
      { earnerId: id.arslan, matchSubPartyId: id.arslanSub, rate: '0.0015' },
    ],
  });

  let before = '';

  it('before any rules: the invoice salesman earns the usual 0.35%', async () => {
    before = await invoice(id.aliParty, id.pulsesProduct, { salespersonId: id.ali });
    expect(await rows(before)).toEqual([['Ali', 'SALESMAN', '350']]);
  });

  it('only SUPER_ADMIN sets the rules', async () => {
    await as.ADMIN.put('/api/v1/commission/rules').send(RULES()).expect(403);
    const res = await as.SUPER_ADMIN.put('/api/v1/commission/rules').send(RULES());
    expect(res.status).toBe(200);
    expect(res.body.overrider.salespersonId).toBe(id.farhan);
    expect(res.body.shares).toHaveLength(2);
    // Saved invoices keep their commission until recalculated.
    expect(await rows(before)).toEqual([['Ali', 'SALESMAN', '350']]);
  });

  it("the invoice grid and products list show the rules' rate (pulses 0.25%)", async () => {
    const options = (await as.ADMIN.get('/api/v1/products/options').expect(200)).body as {
      id: string;
      effectiveCommissionRate: string;
    }[];
    const rate = (pid?: string) => options.find((o) => o.id === pid)?.effectiveCommissionRate;
    expect([rate(id.pulsesProduct), rate(id.riceProduct)]).toEqual(['0.0025', '0.0035']);
    const one = await as.ADMIN.get(`/api/v1/products/${id.pulsesProduct}`).expect(200);
    expect(one.body.effectiveCommissionRate).toBe('0.0025');
  });

  it('new invoices follow the rules (the four examples of the spec)', async () => {
    const a = await invoice(id.aliParty, id.riceProduct, { salespersonId: id.ali });
    expect(await rows(a)).toEqual([['Farhan Khalid', 'OVERRIDE', '350']]);
    const b = await invoice(id.aliParty, id.pulsesProduct, { salespersonId: id.farhan });
    expect(await rows(b)).toEqual([['Farhan Khalid', 'OVERRIDE', '250']]);
    const c = await invoice(id.aliParty, id.pulsesProduct, { subPartyId: id.arslanSub });
    expect(await rows(c)).toEqual([
      ['Farhan Khalid', 'OVERRIDE', '100'],
      ['Arslan Dar', 'SHARE', '150'],
    ]);
    const d = await invoice(id.arslanParty, id.riceProduct, { subPartyId: null });
    expect(await rows(d)).toEqual([
      ['Farhan Khalid', 'OVERRIDE', '200'],
      ['Arslan Dar', 'SHARE', '150'],
    ]);
    const line = await t.prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: c } });
    expect([line.commissionRate.toString(), line.commission.toString()]).toEqual(['0.0025', '250']);
  });

  it('a dry run shows before / after per earner and changes nothing', async () => {
    const res = await as.SUPER_ADMIN.post('/api/v1/commission/recalculate').expect(200);
    expect(res.body).toMatchObject({ dryRun: true, invoices: 5, lines: 5, changedLines: 1 });
    // The old invoice: Ali 350 → Farhan 250 (pulses at Farhan's 0.25%).
    const by = Object.fromEntries(
      res.body.earners.map(
        (e: { salesperson: { name: string }; before: string; after: string }) => [
          e.salesperson.name,
          [e.before, e.after],
        ],
      ),
    );
    expect(by).toEqual({
      'Farhan Khalid': ['900', '1150'],
      'Arslan Dar': ['300', '300'],
      Ali: ['350', '0'],
    });
    expect(await rows(before)).toEqual([['Ali', 'SALESMAN', '350']]);
  });

  it('recalculating applies the rules to every invoice; amounts never change', async () => {
    await as.ADMIN.post('/api/v1/commission/recalculate?dryRun=false').expect(403);
    const res = await as.SUPER_ADMIN.post('/api/v1/commission/recalculate?dryRun=false').expect(
      200,
    );
    expect(res.body).toMatchObject({ dryRun: false, changedLines: 1, totalAfter: '1450' });
    expect(await rows(before)).toEqual([['Farhan Khalid', 'OVERRIDE', '250']]);
    const inv = await t.prisma.invoice.findUniqueOrThrow({ where: { id: before } });
    expect([inv.totalAmount.toString(), inv.totalCommission.toString()]).toEqual(['100000', '250']);
    const again = await as.SUPER_ADMIN.post('/api/v1/commission/recalculate').expect(200);
    expect(again.body.changedLines).toBe(0);
  });

  it('the report shows each earner, own sales and shares apart', async () => {
    const res = await as.ADMIN.get(
      '/api/v1/commission/report?from=2026-11-01&to=2026-11-30',
    ).expect(200);
    expect(
      res.body.rows.map(
        (r: {
          salesperson: { name: string };
          basis: string;
          commission: string;
          lines: number;
        }) => [r.salesperson.name, r.basis, r.commission, r.lines],
      ),
    ).toEqual([
      ['Farhan Khalid', 'OVERRIDE', '1150', 5],
      ['Arslan Dar', 'SHARE', '300', 2],
    ]);
    expect(res.body.total).toBe('1450');
  });

  it('a salesman with commission entries cannot be deleted (deactivate instead)', async () => {
    await as.ADMIN.delete(`/api/v1/salespersons/${id.arslan}`).expect(409);
  });
});
