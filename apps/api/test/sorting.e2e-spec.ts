import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

/** Sorting (`?sort=field:dir`) and pagination across every list endpoint. */
describe('sorting & pagination (e2e)', () => {
  let t: TestApp;
  let admin: Agent;

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('SUPER_ADMIN', 'zed@waqar.pk');
    await t.createUser('ADMIN', 'admin@waqar.pk');
    admin = await t.loginAs('admin@waqar.pk');

    const p = t.prisma;
    const rice = await p.category.create({ data: { name: 'Rice' } });
    const pulses = await p.category.create({ data: { name: 'Pulses' } });
    const [a, b, c] = await Promise.all([
      p.product.create({
        data: { sku: 3, name: 'Alpha Rice', unitWeightKg: 25, categoryId: rice.id },
      }),
      p.product.create({
        data: { sku: 1, name: 'Beta Daal', unitWeightKg: 25, categoryId: pulses.id },
      }),
      p.product.create({
        data: { sku: 2, name: 'Gamma Rice', unitWeightKg: 10, packPcs: 4, categoryId: rice.id },
      }),
    ]);
    const dina = await p.city.create({ data: { name: 'Dina' } });
    const attock = await p.city.create({ data: { name: 'Attock' } });
    const p1 = await p.party.create({ data: { name: 'Zahid Traders', cityId: attock.id } });
    const p2 = await p.party.create({ data: { name: 'Awan Traders', cityId: dina.id } });
    const p3 = await p.party.create({ data: { name: 'Malik Traders' } });

    const inv = (
      invoiceNo: number,
      invoiceDate: string,
      partyId: string,
      productId: string,
      qtyPacks: number,
    ) =>
      admin
        .post('/api/v1/invoices')
        .send({ invoiceNo, invoiceDate, partyId, lines: [{ productId, qtyPacks, rate40Kg: 8000 }] })
        .expect(201);
    await inv(10, '2026-09-01', p1.id, a.id, 10); // 50,000
    await inv(11, '2026-09-03', p2.id, b.id, 40); // 200,000
    await inv(12, '2026-09-02', p3.id, c.id, 5); // 5 × 40 KG → 40,000
    const pay = (paymentDate: string, partyId: string, amount: number) =>
      admin.post('/api/v1/payments').send({ paymentDate, partyId, amount }).expect(201);
    await pay('2026-09-05', p2.id, 150000);
    await pay('2026-09-04', p1.id, 10000);
    await pay('2026-09-06', p3.id, 40000);
  });

  afterAll(() => t.close());

  const get = async (path: string) => (await admin.get(`/api/v1/${path}`).expect(200)).body;
  const col = <T>(rows: T[], pick: (r: T) => unknown) => rows.map(pick);

  it('masters: sort by any listed column, including a related name', async () => {
    expect(col((await get('products?sort=sku:desc')).data, (r: { sku: number }) => r.sku)).toEqual([
      3, 2, 1,
    ]);
    expect(
      col(
        (await get('products?sort=category:asc')).data,
        (r: { category: { name: string } }) => r.category.name,
      ),
    ).toEqual(['Pulses', 'Rice', 'Rice']);
    expect(col((await get('parties?sort=city:asc')).data, (r: { name: string }) => r.name)).toEqual(
      [
        'Zahid Traders', // Attock
        'Awan Traders', // Dina
        'Malik Traders', // no city sorts last
      ],
    );
    expect(
      col((await get('parties?sort=name:desc')).data, (r: { name: string }) => r.name),
    ).toEqual(['Zahid Traders', 'Malik Traders', 'Awan Traders']);
  });

  it('unknown columns fall back to the default order instead of failing', async () => {
    const res = await get('parties?sort=passwordHash:desc');
    expect(col(res.data, (r: { name: string }) => r.name)).toEqual([
      'Awan Traders',
      'Malik Traders',
      'Zahid Traders',
    ]);
    await admin.get('/api/v1/parties?sort=name').expect(400); // malformed → validation error
  });

  it('invoices: by party, amount and date', async () => {
    expect(
      col((await get('invoices?sort=party:asc')).data, (r: { invoiceNo: number }) => r.invoiceNo),
    ).toEqual([11, 12, 10]);
    expect(
      col(
        (await get('invoices?sort=totalAmount:desc')).data,
        (r: { invoiceNo: number }) => r.invoiceNo,
      ),
    ).toEqual([11, 10, 12]);
    expect(col((await get('invoices')).data, (r: { invoiceNo: number }) => r.invoiceNo)).toEqual([
      11, 12, 10,
    ]); // date desc
  });

  it('invoice lines: by product and category', async () => {
    expect(
      col(
        (await get('invoices/lines?sort=product:asc')).data,
        (r: { product: { name: string } }) => r.product.name,
      ),
    ).toEqual(['Alpha Rice', 'Beta Daal', 'Gamma Rice']);
    expect(
      col(
        (await get('invoices/lines?sort=category:desc')).data,
        (r: { category: { name: string } }) => r.category.name,
      ),
    ).toEqual(['Rice', 'Rice', 'Pulses']);
  });

  it('payments: by amount and party', async () => {
    expect(
      col((await get('payments?sort=amount:asc')).data, (r: { amount: string }) => r.amount),
    ).toEqual(['10000', '40000', '150000']);
    expect(
      col(
        (await get('payments?sort=party:desc')).data,
        (r: { party: { name: string } }) => r.party.name,
      ),
    ).toEqual(['Zahid Traders', 'Malik Traders', 'Awan Traders']);
  });

  it('recovery: sorted and paged, totals over every party', async () => {
    const res = await get('recovery/parties?sort=outstanding:asc&page=1&pageSize=2');
    expect(res.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    // Outstanding: Malik 0, Awan 50,000, Zahid 40,000 → ascending: Malik, Zahid
    expect(col(res.data, (r: { party: { name: string } }) => r.party.name)).toEqual([
      'Malik Traders',
      'Zahid Traders',
    ]);
    expect(res.totals).toMatchObject({ parties: 3, outstanding: '90000' });
    const page2 = await get('recovery/parties?sort=outstanding:asc&page=2&pageSize=2');
    expect(col(page2.data, (r: { party: { name: string } }) => r.party.name)).toEqual([
      'Awan Traders',
    ]);
    const byName = await get('recovery/parties?sort=party:asc');
    expect(col(byName.data, (r: { party: { name: string } }) => r.party.name)).toEqual([
      'Awan Traders',
      'Malik Traders',
      'Zahid Traders',
    ]);
  });

  it('users and audit log', async () => {
    expect(
      col((await get('users?sort=email:desc')).data, (r: { email: string }) => r.email),
    ).toEqual(['zed@waqar.pk', 'admin@waqar.pk']);
    const audit = await get('audit?sort=action:asc&pageSize=500');
    const actions = col(audit.data, (r: { action: string }) => r.action);
    expect(actions).toEqual([...actions].sort());
  });

  it('pages never overlap or skip rows, even when sorted values tie', async () => {
    // Two products share unitWeightKg 25: ties must still page deterministically.
    const pages = [];
    for (let page = 1; page <= 3; page++) {
      pages.push(...(await get(`products?sort=unitWeightKg:asc&page=${page}&pageSize=1`)).data);
    }
    const ids = pages.map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(3);
  });
});
