import type { Role } from '@sms/shared';
import request from 'supertest';
import { invoiceItems, pdfFromItems } from './pdf-from-items';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

/**
 * Phase O4: invoice PDFs in the owner's format (rebuilt from the sample invoices' text) are
 * read, matched and posted; their bags reduce pending orders.
 */
describe('invoice PDFs (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role, Agent>;
  const id: Record<string, string> = new Proxy({} as Record<string, string>, {
    get: (o, k: string) => o[k] ?? '',
  });

  const upload = (agent: Agent, ...names: string[]) => {
    let req = agent.post('/api/v1/invoice-pdfs');
    for (const n of names) req = req.attach('files', pdfFromItems(invoiceItems(n)), `${n}.pdf`);
    return req;
  };
  const pending = async (orderId: string | undefined) =>
    (await as.ADMIN.get(`/api/v1/orders/${orderId}`).expect(200)).body.lines.map(
      (l: { pendingPacks: number }) => l.pendingPacks,
    );
  const order = async (body: object) =>
    (await as.ADMIN.post('/api/v1/orders').send(body).expect(201)).body.id as string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('SUPER_ADMIN', 'super@waqar.pk');
    await t.createUser('ADMIN', 'admin@waqar.pk');
    await t.createUser('USER', 'user@waqar.pk');
    as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    as.USER = await t.loginAs('user@waqar.pk');
    const post = async (path: string, body: object) =>
      (await as.ADMIN.post(`/api/v1/${path}`).send(body).expect(201)).body.id as string;
    const rice = await post('categories', { name: 'Rice' });
    const pulses = await post('categories', { name: 'Pulses' });
    const ghee = await post('categories', { name: 'Desi Ghee' });
    id.platinum = await post('products', {
      sku: 1,
      name: 'ZAFARANI STEAM PLATINUM 25KG',
      unitWeightKg: 25,
      categoryId: rice,
    });
    id.regular = await post('products', {
      sku: 27,
      name: 'DAAL CHANNA REGULAR 25KG',
      unitWeightKg: 25,
      categoryId: pulses,
    });
    id.sindhi = await post('products', {
      sku: 30,
      name: 'SINDHI CHANA 5MM 25KG',
      unitWeightKg: 25,
      categoryId: pulses,
    });
    id.moong = await post('products', {
      sku: 38,
      name: 'DAAL MOONG 25KG',
      unitWeightKg: 25,
      categoryId: pulses,
    });
    id.ghee = await post('products', {
      sku: 43,
      name: 'DESI GHEE 1/2 KG',
      unitWeightKg: 0.5,
      packPcs: 12,
      categoryId: ghee,
    });
    id.ashfaq = await post('parties', { name: 'Alpha Commission Shop' });
    id.inayat = await post('parties', { name: 'Charlie Traders' });
    id.tahir = await post('parties', { name: 'Echo Sha Traders' });
    id.shalimar = await post('parties', { name: 'Delta Traders' });

    // Order 3159 for Inayat (the invoice names it: "SUPPLY FROM U-2 O.N 3159").
    await as.SUPER_ADMIN.patch('/api/v1/settings').send({ firstOrderNo: 3159 }).expect(200);
    const line = (productId: string, qtyPacks: number, rate: string, cropYear?: string) => ({
      productId,
      qtyPacks,
      rate,
      ...(cropYear ? { cropYear } : {}),
    });
    id.inayatOrder = await order({
      orderDate: '2026-11-01',
      partyId: id.inayat,
      lines: [line(id.platinum, 1000, '11300', '26-27')],
    });
    id.ashfaqOrder = await order({
      orderDate: '2026-11-01',
      partyId: id.ashfaq,
      lines: [line(id.platinum, 150, '13500', '25-26')],
    });
    id.tahirOrder = await order({
      orderDate: '2026-11-02',
      partyId: id.tahir,
      lines: [line(id.regular, 20, '10100', '25-26'), line(id.moong, 15, '10500', '25-26')],
    });
    // Ghee: 10 cartons of 12 × 500 g at 1,450 a tin = 17,400 a carton.
    id.gheeOrder = await order({
      orderDate: '2026-11-01',
      partyId: id.shalimar,
      lines: [line(id.ghee, 10, '1450', '25-26')],
    });
  });

  afterAll(() => t.close());

  let ashfaqPdf = '';
  let tahirPdf = '';

  it('only the office may upload', async () => {
    await upload(as.USER, 'ashfaq').expect(403);
  });

  it('a new product name waits for review; once chosen, the invoice posts and the name is remembered', async () => {
    const [row] = (await upload(as.ADMIN, 'ashfaq').expect(201)).body;
    ashfaqPdf = row.id;
    expect(row).toMatchObject({
      status: 'NEEDS_REVIEW',
      invoiceNo: 706,
      invoiceDate: '2026-11-03',
    });
    expect(row.problems).toEqual([
      'Line 1: Choose the product for "PURE ZAFARANI - 1121 STEAM - 25 KG".',
    ]);

    const detail = await as.ADMIN.get(`/api/v1/invoice-pdfs/${ashfaqPdf}`).expect(200);
    // The party matched by name without the city ("… - RAWALPINIDI").
    expect(detail.body.matched.party.name).toBe('Alpha Commission Shop');
    expect(detail.body.header).toMatchObject({
      doNo: '727',
      dcNo: '725',
      ogpNo: '14515',
      vehicleNo: 'ABC---1111',
    });

    const res = await as.ADMIN.post(`/api/v1/invoice-pdfs/${ashfaqPdf}/resolve`)
      .send({ resolution: { lines: { '1': { productId: id.platinum } } }, post: true })
      .expect(200);
    expect(res.body.status).toBe('POSTED');
    expect(res.body.lines[0].allocations).toMatchObject([{ qtyPacks: 100 }]);
    expect(await pending(id.ashfaqOrder)).toEqual([50]);

    const inv = await t.prisma.invoice.findFirstOrThrow({
      where: { invoiceNo: 706 },
      include: { lines: true },
    });
    expect([inv.doNo, inv.ogpNo, inv.supplyNote, inv.totalAmount.toString()]).toEqual([
      '727',
      '14515',
      'SUPPLY FROM U-2 OLD',
      '843750',
    ]);
    expect([inv.lines[0]!.cropYear, inv.lines[0]!.rateBasis]).toEqual(['2025-2026', 'PER_40KG']);
  });

  it('a remembered name and "O.N 3159" post on upload, against that order', async () => {
    const [row] = (await upload(as.ADMIN, 'inayat').expect(201)).body;
    expect(row).toMatchObject({ status: 'POSTED', problems: [] });
    expect(await pending(id.inayatOrder)).toEqual([300]);
  });

  it('the same invoice again is a duplicate', async () => {
    const [row] = (await upload(as.ADMIN, 'ashfaq').expect(201)).body;
    expect(row.status).toBe('DUPLICATE');
    await as.ADMIN.delete(`/api/v1/invoice-pdfs/${row.id}`).expect(204);
  });

  it('bags with no pending order at that rate wait; the office can let them post without an order', async () => {
    const [row] = (await upload(as.ADMIN, 'tahir').expect(201)).body;
    tahirPdf = row.id;
    expect(row.status).toBe('NEEDS_REVIEW');
    const res = await as.ADMIN.post(`/api/v1/invoice-pdfs/${tahirPdf}/resolve`)
      .send({
        resolution: {
          partyId: id.tahir,
          lines: {
            '1': { productId: id.regular },
            '2': { productId: id.sindhi },
            '3': { productId: id.moong },
          },
        },
        post: true,
      })
      .expect(200);
    // Sindhi chana was never ordered.
    expect(res.body.status).toBe('NEEDS_REVIEW');
    // The PDF's name carries the address, so the party is chosen once (and remembered).
    expect(res.body.problems).toEqual([
      'Line 2: No pending order for SINDHI CHANA 5MM 25KG (2025-2026) at this rate.',
    ]);

    const ok = await as.ADMIN.post(`/api/v1/invoice-pdfs/${tahirPdf}/resolve`)
      .send({
        resolution: {
          partyId: id.tahir,
          lines: {
            '1': { productId: id.regular },
            '2': { productId: id.sindhi, allowWithoutOrder: true },
            '3': { productId: id.moong },
          },
        },
        post: true,
      })
      .expect(200);
    expect(ok.body.status).toBe('POSTED');
    expect(await pending(id.tahirOrder)).toEqual([0, 5]);
  });

  it('ghee cartons match the per-tin booked rate; before the go-live date opening orders are left alone', async () => {
    await t.prisma.order.update({ where: { id: id.gheeOrder }, data: { isOpening: true } });
    await as.SUPER_ADMIN.patch('/api/v1/settings')
      .send({ ordersGoLiveDate: '2026-11-04' })
      .expect(200);
    const [row] = (await upload(as.ADMIN, 'shalimar2').expect(201)).body;
    // The invoice (03-Nov) is already counted in the opening report.
    expect(row.problems).toEqual([
      'Line 1: Choose the product for "ZAFARANI DASI GHEE 500 GM - 0.5 KG X 12= 6 KG PER CARTON".',
    ]);
    let res = await as.ADMIN.post(`/api/v1/invoice-pdfs/${row.id}/resolve`)
      .send({ resolution: { lines: { '1': { productId: id.ghee } } }, post: true })
      .expect(200);
    expect(res.body.problems).toEqual([
      'Line 1: No pending order for DESI GHEE 1/2 KG (2025-2026) at this rate.',
    ]);

    await as.SUPER_ADMIN.patch('/api/v1/settings')
      .send({ ordersGoLiveDate: '2026-11-01' })
      .expect(200);
    res = await as.ADMIN.post(`/api/v1/invoice-pdfs/${row.id}/resolve`)
      .send({ resolution: { lines: { '1': { productId: id.ghee } } }, post: true })
      .expect(200);
    expect(res.body.status).toBe('POSTED');
    expect(await pending(id.gheeOrder)).toEqual([5]);
    const inv = await t.prisma.invoice.findFirstOrThrow({
      where: { invoiceNo: 705 },
      include: { lines: true },
    });
    expect([
      inv.lines[0]!.rateBasis,
      inv.lines[0]!.ratePerPack.toString(),
      inv.totalAmount.toString(),
    ]).toEqual(['PER_UNIT', '17400', '87000']);
  });

  it('a product whose pack does not fit the invoice weight is caught', async () => {
    const [row] = (await upload(as.ADMIN, 'haji').expect(201)).body;
    const res = await as.ADMIN.post(`/api/v1/invoice-pdfs/${row.id}/resolve`)
      .send({
        resolution: { partyId: id.tahir, lines: { '3': { productId: id.ghee } } },
        post: false,
      })
      .expect(200);
    expect(res.body.problems).toContain(
      'Line 3: 2 × DESI GHEE 1/2 KG (6 kg a pack) is 12 kg, but the invoice says 50 kg.',
    );
    expect(res.body.status).toBe('NEEDS_REVIEW');
  });

  it('editing an order keeps its deliveries; an invoice that delivered bags cannot be edited', async () => {
    const res = await as.ADMIN.put(`/api/v1/orders/${id.inayatOrder}`)
      .send({
        orderDate: '2026-11-01',
        partyId: id.inayat,
        lines: [{ productId: id.platinum, cropYear: '26-27', qtyPacks: 900 }],
      })
      .expect(200);
    expect(res.body.lines[0]).toMatchObject({
      qtyPacks: 900,
      dispatchedPacks: 700,
      pendingPacks: 200,
    });

    const inv = await t.prisma.invoice.findFirstOrThrow({ where: { invoiceNo: 706 } });
    const edit = await as.ADMIN.put(`/api/v1/invoices/${inv.id}`)
      .send({
        invoiceNo: 706,
        invoiceDate: '2026-11-03',
        partyId: id.ashfaq,
        lines: [{ productId: id.platinum, qtyPacks: 1, rate40Kg: '1' }],
      })
      .expect(409);
    expect(edit.body.message).toMatch(/delete it and read its PDF again/);
  });

  it('deleting the invoice gives the bags back to the order', async () => {
    const inv = await t.prisma.invoice.findFirstOrThrow({ where: { invoiceNo: 706 } });
    await as.ADMIN.delete(`/api/v1/invoices/${inv.id}`).expect(204);
    expect(await pending(id.ashfaqOrder)).toEqual([150]);
    // The PDF can be read again.
    const [row] = (await upload(as.ADMIN, 'ashfaq').expect(201)).body;
    expect(row.status).toBe('POSTED');
    expect(await pending(id.ashfaqOrder)).toEqual([50]);
  });

  it('lists PDFs by status and serves the original file', async () => {
    const list = await as.ADMIN.get('/api/v1/invoice-pdfs?status=NEEDS_REVIEW').expect(200);
    expect(list.body.data.map((r: { invoiceNo: number }) => r.invoiceNo)).toEqual([699]);
    expect(list.body.counts).toMatchObject({ POSTED: 5, NEEDS_REVIEW: 1 });
    const file = await as.ADMIN.get(`/api/v1/invoice-pdfs/${ashfaqPdf}/file`).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
  });

  it('the pending report reflects the invoices', async () => {
    const r = await as.ADMIN.get('/api/v1/orders/pending-report').expect(200);
    const lines = r.body.groups.flatMap((g: { lines: unknown[] }) => g.lines);
    expect(
      lines.map((l: { orderNo: number; dispatchedPacks: number; pendingPacks: number }) => [
        l.orderNo,
        l.dispatchedPacks,
        l.pendingPacks,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [3159, 700, 200],
        [3160, 100, 50],
        [3161, 10, 5],
        [3162, 5, 5],
      ]),
    );
  });
});
