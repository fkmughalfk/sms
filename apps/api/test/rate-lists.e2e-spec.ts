import type { Role } from '@sms/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

/**
 * Rate lists (orders module, phase O1), modelled on the owner's list of 04-11-2026.
 * Lists dated 2020 are in the past and 2099 in the future, whatever today is.
 */
describe('rate lists (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role, Agent>;
  const p: Record<'platinum' | 'supreme' | 'ghee' | 'cumin' | 'old', string> = {
    platinum: '',
    supreme: '',
    ghee: '',
    cumin: '',
    old: '',
  };

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('SUPER_ADMIN', 'super@waqar.pk');
    await t.createUser('ADMIN', 'admin@waqar.pk');
    await t.createUser('USER', 'user@waqar.pk');
    as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    as.USER = await t.loginAs('user@waqar.pk');

    const cat = async (name: string) =>
      (await as.ADMIN.post('/api/v1/categories').send({ name }).expect(201)).body.id as string;
    const [rice, pulses, ghee, spices] = await Promise.all(
      ['Rice', 'Pulses', 'Desi Ghee', 'Spices'].map(cat),
    );
    const prod = async (body: object) =>
      (await as.ADMIN.post('/api/v1/products').send(body).expect(201)).body.id as string;
    p.platinum = await prod({
      sku: 1,
      name: 'ZAFARANI STEAM PLATINUM 25KG',
      unitWeightKg: 25,
      categoryId: rice,
    });
    p.supreme = await prod({
      sku: 26,
      name: 'DAAL CHANNA SUPREME 25KG',
      unitWeightKg: 25,
      categoryId: pulses,
    });
    p.ghee = await prod({
      sku: 44,
      name: 'DESI GHEE 1KG',
      unitWeightKg: 1,
      packPcs: 6,
      categoryId: ghee,
    });
    p.cumin = await prod({ sku: 71, name: 'CUMIN 5.5KG', unitWeightKg: 5.5, categoryId: spices });
    p.old = await prod({ sku: 99, name: 'OLD PRODUCT', unitWeightKg: 25, categoryId: rice });
    await as.ADMIN.patch(`/api/v1/products/${p.old}/status`).send({ isActive: false }).expect(200);
  });

  afterAll(() => t.close());

  interface Line {
    productId: string;
    basis: string;
    rate: string;
    cropYear?: string;
    note?: string;
    isAvailable?: boolean;
  }
  const list04Nov = (
    effectiveFrom: string,
  ): { effectiveFrom: string; remarks: string; items: Line[] } => ({
    effectiveFrom,
    remarks: 'All pulses are non-returnable.',
    items: [
      { productId: p.platinum, cropYear: '25-26', basis: 'PER_40KG', rate: '13500' },
      { productId: p.platinum, cropYear: '26-27', basis: 'PER_40KG', rate: '11500' },
      { productId: p.supreme, basis: 'PER_40KG', rate: '11300', note: 'Australia' },
      { productId: p.ghee, cropYear: '25-26', basis: 'PER_UNIT', rate: '2550' },
      { productId: p.cumin, basis: 'PER_UNIT', rate: '', isAvailable: false },
    ],
  });

  let firstId = '';
  let secondId = '';

  it('no list in effect yet → 404 for current', async () => {
    const res = await as.USER.get('/api/v1/rate-lists/current').expect(404);
    expect(res.body.message).toBe('No rate list is in effect yet.');
  });

  it('USER can read but not write; ADMIN can write', async () => {
    await as.USER.post('/api/v1/rate-lists').send(list04Nov('2020-01-01T09:00')).expect(403);
    await as.USER.get('/api/v1/rate-lists/draft').expect(403);
    await as.USER.get('/api/v1/rate-lists/template').expect(403);
    const res = await as.ADMIN.post('/api/v1/rate-lists')
      .send(list04Nov('2020-01-01T09:00'))
      .expect(201);
    firstId = res.body.id;
    await as.USER.get('/api/v1/rate-lists').expect(200);
    await as.USER.get(`/api/v1/rate-lists/${firstId}`).expect(200);
    await as.USER.put(`/api/v1/rate-lists/${firstId}`)
      .send(list04Nov('2020-01-01T09:00'))
      .expect(403);
    await as.USER.delete(`/api/v1/rate-lists/${firstId}`).expect(403);
  });

  it('stores each line with its pack price; ghee is priced per tin × 6 per carton', async () => {
    const res = await as.USER.get(`/api/v1/rate-lists/${firstId}`).expect(200);
    expect(res.body).toMatchObject({
      effectiveFrom: '2020-01-01T09:00',
      remarks: 'All pulses are non-returnable.',
      status: 'CURRENT',
      itemCount: 5,
      availableCount: 4,
      previous: null,
    });
    const lines = res.body.items.map((l: Record<string, unknown>) => [
      (l.product as { name: string }).name,
      l.cropYear,
      l.basis,
      l.rate,
      l.packRate,
      l.isAvailable,
    ]);
    expect(lines).toEqual([
      ['ZAFARANI STEAM PLATINUM 25KG', '2025-2026', 'PER_40KG', '13500', '8437.5', true],
      ['ZAFARANI STEAM PLATINUM 25KG', '2026-2027', 'PER_40KG', '11500', '7187.5', true],
      ['DAAL CHANNA SUPREME 25KG', null, 'PER_40KG', '11300', '7062.5', true],
      ['DESI GHEE 1KG', '2025-2026', 'PER_UNIT', '2550', '15300', true],
      ['CUMIN 5.5KG', null, 'PER_UNIT', null, null, false],
    ]);
    expect(res.body.items[2].note).toBe('Australia');
  });

  it('a newer list becomes current, shows the change against the previous one', async () => {
    const body = list04Nov('2020-02-01T09:00');
    body.items[1]!.rate = '11800';
    secondId = (await as.ADMIN.post('/api/v1/rate-lists').send(body).expect(201)).body.id;

    const current = await as.USER.get('/api/v1/rate-lists/current').expect(200);
    expect(current.body.id).toBe(secondId);
    expect(current.body.previous).toEqual({ id: firstId, effectiveFrom: '2020-01-01T09:00' });
    const platinumNew = current.body.items[1];
    expect([platinumNew.rate, platinumNew.previousRate]).toEqual(['11800', '11500']);

    const all = await as.USER.get('/api/v1/rate-lists').expect(200);
    expect(all.body.data.map((r: { id: string; status: string }) => [r.id, r.status])).toEqual([
      [secondId, 'CURRENT'],
      [firstId, 'PAST'],
    ]);
  });

  it('a list starting in the future is UPCOMING and does not replace the current one', async () => {
    const res = await as.ADMIN.post('/api/v1/rate-lists')
      .send(list04Nov('2099-01-01T09:00'))
      .expect(201);
    expect(res.body.status).toBe('UPCOMING');
    expect((await as.USER.get('/api/v1/rate-lists/current').expect(200)).body.id).toBe(secondId);
    await as.ADMIN.delete(`/api/v1/rate-lists/${res.body.id}`).expect(204);
  });

  it('refuses two lists at the same time, unknown or inactive products, and bad lines', async () => {
    const clash = await as.ADMIN.post('/api/v1/rate-lists')
      .send(list04Nov('2020-02-01T09:00'))
      .expect(409);
    expect(clash.body.message).toMatch(/already starts at this date and time/);

    const withOld = list04Nov('2020-03-01T09:00');
    withOld.items.push({ productId: p.old, basis: 'PER_40KG', rate: '9000' });
    expect(
      (await as.ADMIN.post('/api/v1/rate-lists').send(withOld).expect(400)).body.message,
    ).toMatch(/OLD PRODUCT is inactive/);

    const unknown = list04Nov('2020-03-01T09:00');
    unknown.items[0]!.productId = 'nope';
    await as.ADMIN.post('/api/v1/rate-lists').send(unknown).expect(400);

    const dup = list04Nov('2020-03-01T09:00');
    dup.items[1]!.cropYear = '2025-2026';
    expect((await as.ADMIN.post('/api/v1/rate-lists').send(dup).expect(400)).body.message).toMatch(
      /already on line 1/,
    );

    const noRate = list04Nov('2020-03-01T09:00');
    noRate.items[0]!.rate = '';
    expect((await as.ADMIN.post('/api/v1/rate-lists').send(noRate).expect(400)).body.message).toBe(
      'Enter a rate, or mark it N/A.',
    );
  });

  it('the draft copies the newest list (both crop years) and adds other active products as N/A', async () => {
    const res = await as.ADMIN.get('/api/v1/rate-lists/draft').expect(200);
    expect(res.body.copiedFrom).toEqual({ id: secondId, effectiveFrom: '2020-02-01T09:00' });
    const lines = res.body.items.map((l: Record<string, unknown>) => [
      (l.product as { name: string }).name,
      l.cropYear,
      l.rate,
      l.isAvailable,
    ]);
    // Ordered like the printed list (rice, pulses, ghee, spices), then product #;
    // the inactive product is left out.
    expect(lines).toEqual([
      ['ZAFARANI STEAM PLATINUM 25KG', '2025-2026', '13500', true],
      ['ZAFARANI STEAM PLATINUM 25KG', '2026-2027', '11800', true],
      ['DAAL CHANNA SUPREME 25KG', null, '11300', true],
      ['DESI GHEE 1KG', '2025-2026', '2550', true],
      ['CUMIN 5.5KG', null, null, false],
    ]);
  });

  it('editing replaces the lines and writes an audit entry with before and after', async () => {
    const body = list04Nov('2020-01-01T10:30');
    body.items = body.items.slice(0, 2);
    const res = await as.ADMIN.put(`/api/v1/rate-lists/${firstId}`).send(body).expect(200);
    expect(res.body).toMatchObject({ effectiveFrom: '2020-01-01T10:30', itemCount: 2 });

    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { entity: 'RateList', entityId: firstId, action: 'UPDATE' },
    });
    expect((audit.before as { itemCount: number }).itemCount).toBe(5);
    expect((audit.after as { itemCount: number }).itemCount).toBe(2);
  });

  it('a product on a rate list cannot be deleted (deactivate it instead)', async () => {
    const res = await as.ADMIN.delete(`/api/v1/products/${p.supreme}`).expect(409);
    expect(res.body.message).toMatch(/rate list line/);
  });

  it('template download → edit → upload reads the lines back for review', async () => {
    const file = await as.ADMIN.get('/api/v1/rate-lists/template')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-type']).toContain('spreadsheetml');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.body as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(7).value).toBe('Rate');
    // New ghee tin price. Add a typo'd crop year row and an unknown product.
    ws.eachRow((row) => {
      if (row.getCell(2).value === 'DESI GHEE 1KG') row.getCell(7).value = 2600;
    });
    ws.addRow([1, 'ZAFARANI STEAM PLATINUM 25KG', 'Rice', 25, '27\\27', 'Per 40 kg', 11100, 'Yes']);
    ws.addRow([555, 'NO SUCH PRODUCT', 'Rice', 25, '', 'Per 40 kg', 1000, 'Yes']);
    const edited = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await as.ADMIN.post('/api/v1/rate-lists/parse-excel')
      .attach('file', edited, 'rate-list.xlsx')
      .expect(200);
    const ghee = res.body.items.find(
      (l: { product: { name: string } }) => l.product.name === 'DESI GHEE 1KG',
    );
    expect([ghee.rate, ghee.previousRate, ghee.packRate]).toEqual(['2600', '2550', '15600']);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.problems.map((x: { message: string }) => x.message)).toEqual([
      'Enter the crop year like 2025-2026.',
      'Unknown product "555".',
    ]);
  });

  it('upload rejects a file that is not a workbook', async () => {
    const res = await as.ADMIN.post('/api/v1/rate-lists/parse-excel')
      .attach('file', Buffer.from('hello'), 'rates.xlsx')
      .expect(200);
    expect(res.body.problems).toEqual([{ row: 0, message: 'This is not a readable .xlsx file.' }]);
  });

  it('deleting a list removes it and keeps a full snapshot in the audit log', async () => {
    await as.ADMIN.delete(`/api/v1/rate-lists/${secondId}`).expect(204);
    await as.USER.get(`/api/v1/rate-lists/${secondId}`).expect(404);
    expect((await as.USER.get('/api/v1/rate-lists/current').expect(200)).body.id).toBe(firstId);
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { entity: 'RateList', entityId: secondId, action: 'DELETE' },
    });
    expect((audit.before as { items: unknown[] }).items).toHaveLength(5);
  });
});
