import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

/** Select-all bulk actions: masters, users, invoices and payments. */
describe('bulk actions (e2e)', () => {
  let t: TestApp;
  let admin: Agent;
  let user: Agent;
  let adminId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('SUPER_ADMIN', 'super@waqar.pk');
    adminId = (await t.createUser('ADMIN', 'admin@waqar.pk')).id;
    await t.createUser('USER', 'user@waqar.pk');
    admin = await t.loginAs('admin@waqar.pk');
    user = await t.loginAs('user@waqar.pk');
  });

  afterAll(() => t.close());

  const create = async (path: string, body: object) =>
    (await admin.post(`/api/v1/${path}`).send(body).expect(201)).body as { id: string };

  it('masters: deactivate, activate and delete many; records in use are skipped with the reason', async () => {
    const a = await create('cities', { name: 'Bulk A' });
    const b = await create('cities', { name: 'Bulk B' });
    const used = await create('cities', { name: 'Bulk Used' });
    await create('parties', { name: 'Bulk Party', cityId: used.id });
    const ids = [a.id, b.id, used.id];

    await user.post('/api/v1/cities/bulk').send({ ids, action: 'deactivate' }).expect(403);

    const off = await admin.post('/api/v1/cities/bulk').send({ ids, action: 'deactivate' });
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ done: 3, skipped: [] });
    expect(await t.prisma.city.count({ where: { id: { in: ids }, isActive: true } })).toBe(0);

    await admin
      .post('/api/v1/cities/bulk')
      .send({ ids, action: 'activate' })
      .expect(200, { done: 3, skipped: [] });

    const del = await admin
      .post('/api/v1/cities/bulk')
      .send({ ids: [...ids, a.id, 'missing-id'], action: 'delete' }) // duplicate id collapses
      .expect(200);
    expect(del.body.done).toBe(2);
    expect(del.body.skipped).toEqual([
      {
        id: used.id,
        reason: '“Bulk Used” is used on 1 party, so it can’t be deleted. Deactivate it instead.',
      },
      { id: 'missing-id', reason: 'City not found.' },
    ]);
    expect(await t.prisma.city.count({ where: { id: { in: ids } } })).toBe(1);
    expect(
      await t.prisma.auditLog.count({
        where: { entity: 'City', action: 'DELETE', entityId: { in: [a.id, b.id] } },
      }),
    ).toBe(2);
  });

  it('validates the request', async () => {
    await admin.post('/api/v1/cities/bulk').send({ ids: [], action: 'delete' }).expect(400);
    await admin
      .post('/api/v1/cities/bulk')
      .send({ ids: ['x'], action: 'nuke' })
      .expect(400);
  });

  it('users: accounts you may not manage (here: your own admin account) are skipped', async () => {
    const fresh = (
      await admin
        .post('/api/v1/users')
        .send({ name: 'Bulk U', email: 'bulku@waqar.pk', password: 'Password123!', role: 'USER' })
        .expect(201)
    ).body as { id: string };
    const res = await admin
      .post('/api/v1/users/bulk')
      .send({ ids: [fresh.id, adminId], action: 'deactivate' })
      .expect(200);
    expect(res.body.done).toBe(1);
    expect(res.body.skipped).toEqual([
      { id: adminId, reason: 'Admins can only manage users with the User role.' },
    ]);
    await admin
      .post('/api/v1/users/bulk')
      .send({ ids: [fresh.id], action: 'delete' })
      .expect(200, { done: 1, skipped: [] });
  });

  it('invoices and payments: bulk soft delete', async () => {
    const cat = await create('categories', { name: 'Bulk Cat' });
    const product = await create('products', {
      sku: 7701,
      name: 'Bulk Rice',
      unitWeightKg: '25',
      categoryId: cat.id,
    });
    const party = await create('parties', { name: 'Bulk Buyer' });
    const inv = (invoiceNo: number) =>
      create('invoices', {
        invoiceNo,
        invoiceDate: '2026-09-01',
        partyId: party.id,
        lines: [{ productId: product.id, qtyPacks: 1, rate40Kg: 8000 }],
      });
    const [i1, i2] = [await inv(7701), await inv(7702)];
    const pay = () =>
      create('payments', { paymentDate: '2026-09-02', partyId: party.id, amount: 1000 });
    const [p1, p2] = [await pay(), await pay()];

    await user
      .post('/api/v1/invoices/bulk-delete')
      .send({ ids: [i1.id] })
      .expect(403);
    await admin
      .post('/api/v1/invoices/bulk-delete')
      .send({ ids: [i1.id, i2.id] })
      .expect(200, { done: 2, skipped: [] });
    const again = await admin
      .post('/api/v1/invoices/bulk-delete')
      .send({ ids: [i1.id] })
      .expect(200);
    expect(again.body).toEqual({ done: 0, skipped: [{ id: i1.id, reason: 'Invoice not found.' }] });
    expect(await t.prisma.invoice.count({ where: { id: { in: [i1.id, i2.id] } } })).toBe(2); // soft

    await admin
      .post('/api/v1/payments/bulk-delete')
      .send({ ids: [p1.id, p2.id] })
      .expect(200, { done: 2, skipped: [] });
    expect(
      await t.prisma.payment.count({ where: { id: { in: [p1.id, p2.id] }, deletedAt: null } }),
    ).toBe(0);
  });
});
