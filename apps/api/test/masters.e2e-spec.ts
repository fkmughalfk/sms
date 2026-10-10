import type { Role } from '@sms/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

describe('masters (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role, Agent>;

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('SUPER_ADMIN', 'super@waqar.pk');
    await t.createUser('ADMIN', 'admin@waqar.pk');
    await t.createUser('USER', 'user@waqar.pk');
    as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    as.USER = await t.loginAs('user@waqar.pk');
  });

  afterAll(() => t.close());

  const post = (role: Role, path: string, body: object) =>
    as[role].post(`/api/v1/${path}`).send(body);
  const create = async (path: string, body: object) =>
    (await post('ADMIN', path, body).expect(201)).body as { id: string; name: string };

  describe('permission matrix (spec §3: masters read-only for USER)', () => {
    const bodies: Record<string, () => Promise<object>> = {
      categories: async () => ({ name: `Cat ${Math.random()}` }),
      cities: async () => ({ name: `City ${Math.random()}` }),
      banks: async () => ({ name: `Bank ${Math.random()}` }),
      salespersons: async () => ({ name: `ASM ${Math.random()}` }),
      parties: async () => ({ name: `Party ${Math.random()}` }),
      'sub-parties': async () => ({ name: `Sub ${Math.random()}` }),
      products: async () => {
        const cat = await create('categories', { name: `PCat ${Math.random()}` });
        return {
          sku: Math.floor(Math.random() * 1e6),
          name: `Prod ${Math.random()}`,
          unitWeightKg: 25,
          categoryId: cat.id,
        };
      },
    };

    describe.each(Object.keys(bodies))('/%s', (path) => {
      it('every role can list, get and load options', async () => {
        const row = await create(path, await bodies[path]!());
        for (const role of ['SUPER_ADMIN', 'ADMIN', 'USER'] as Role[]) {
          await as[role].get(`/api/v1/${path}`).expect(200);
          await as[role].get(`/api/v1/${path}/options`).expect(200);
          await as[role].get(`/api/v1/${path}/${row.id}`).expect(200);
        }
      });

      it('USER cannot create, edit or deactivate; ADMIN and SUPER_ADMIN can', async () => {
        await post('USER', path, await bodies[path]!()).expect(403);
        await post('SUPER_ADMIN', path, await bodies[path]!()).expect(201);
        const row = await create(path, await bodies[path]!());

        await as.USER.patch(`/api/v1/${path}/${row.id}`).send({ name: 'Nope' }).expect(403);
        await as.USER.patch(`/api/v1/${path}/${row.id}/status`)
          .send({ isActive: false })
          .expect(403);
        await as.ADMIN.patch(`/api/v1/${path}/${row.id}`)
          .send({ name: `${row.name} edited` })
          .expect(200);
        await as.ADMIN.patch(`/api/v1/${path}/${row.id}/status`)
          .send({ isActive: false })
          .expect(200);
      });

      it('requires a session', async () => {
        await request(t.app.getHttpServer()).get(`/api/v1/${path}`).expect(401);
      });
    });
  });

  describe('names', () => {
    it('are trimmed and unique case-insensitively (spec §2.1 "Tayyab Traders " vs "tayyab traders ")', async () => {
      const party = await create('parties', { name: '  Tayyab Traders ' });
      expect(party.name).toBe('Tayyab Traders');
      const dup = await post('ADMIN', 'parties', { name: 'tayyab traders ' }).expect(409);
      expect(dup.body.message).toBe('A party named “tayyab traders” already exists.');
    });

    it('renaming onto another record’s name is a 409; keeping your own name is fine', async () => {
      await create('cities', { name: 'Kamoke' });
      const dina = await create('cities', { name: 'Dina' });
      await as.ADMIN.patch(`/api/v1/cities/${dina.id}`).send({ name: 'KAMOKE' }).expect(409);
      await as.ADMIN.patch(`/api/v1/cities/${dina.id}`).send({ name: 'Dina' }).expect(200);
      await as.ADMIN.patch(`/api/v1/cities/${dina.id}`).send({ name: 'dina' }).expect(200);
    });

    it('validation errors use the standard shape', async () => {
      const res = await post('ADMIN', 'banks', { name: '   ' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, message: 'Enter a name.' });
    });
  });

  describe('active / inactive', () => {
    it('inactive records drop out of options but stay listable and fetchable', async () => {
      const bank = await create('banks', { name: 'Old Bank' });
      await as.ADMIN.patch(`/api/v1/banks/${bank.id}/status`).send({ isActive: false }).expect(200);

      const options = await as.USER.get('/api/v1/banks/options').expect(200);
      expect(options.body.map((o: { id: string }) => o.id)).not.toContain(bank.id);
      const inactive = await as.USER.get('/api/v1/banks?active=false').expect(200);
      expect(inactive.body.data.map((o: { id: string }) => o.id)).toContain(bank.id);
      await as.USER.get(`/api/v1/banks/${bank.id}`).expect(200);
    });

    it('cannot assign an inactive city to a party', async () => {
      const city = await create('cities', { name: 'Ghost Town' });
      await as.ADMIN.patch(`/api/v1/cities/${city.id}/status`)
        .send({ isActive: false })
        .expect(200);
      const res = await post('ADMIN', 'parties', { name: 'Ghost Traders', cityId: city.id }).expect(
        400,
      );
      expect(res.body.message).toBe('Select an active city.');
    });
  });

  describe('delete (only when unused — CLAUDE.md rule 6)', () => {
    it('an unused record can be deleted by ADMIN, not by USER, and the delete is audited', async () => {
      const city = await create('cities', { name: 'Typo City' });
      await as.USER.delete(`/api/v1/cities/${city.id}`).expect(403);
      await as.ADMIN.delete(`/api/v1/cities/${city.id}`).expect(204);
      await as.ADMIN.get(`/api/v1/cities/${city.id}`).expect(404);
      await as.ADMIN.delete(`/api/v1/cities/${city.id}`).expect(404);
      const log = await t.prisma.auditLog.findFirst({
        where: { entity: 'City', entityId: city.id, action: 'DELETE' },
      });
      expect(log?.before).toMatchObject({ name: 'Typo City' });
    });

    it('a record in use is refused with 409 and stays put', async () => {
      const city = await create('cities', { name: 'Busy City' });
      const party = await create('parties', { name: 'Busy Party', cityId: city.id });
      await create('sub-parties', { name: 'Busy Branch', partyId: party.id });

      const res = await as.ADMIN.delete(`/api/v1/cities/${city.id}`).expect(409);
      expect(res.body.message).toBe(
        '“Busy City” is used on 1 party, so it can’t be deleted. Deactivate it instead.',
      );
      const partyRes = await as.ADMIN.delete(`/api/v1/parties/${party.id}`).expect(409);
      expect(partyRes.body.message).toContain('1 sub-party');
      await as.ADMIN.get(`/api/v1/cities/${city.id}`).expect(200);
    });

    it('products used on an invoice — even a deleted one — cannot be deleted', async () => {
      const cat = await create('categories', { name: 'Del Cat' });
      const product = await create('products', {
        sku: 9901,
        name: 'Del Rice',
        unitWeightKg: '25',
        categoryId: cat.id,
      });
      const party = await create('parties', { name: 'Del Party' });
      const inv = await as.ADMIN.post('/api/v1/invoices')
        .send({
          invoiceNo: 9901,
          invoiceDate: '2026-09-01',
          partyId: party.id,
          lines: [{ productId: product.id, qtyPacks: 1, rate40Kg: 8000 }],
        })
        .expect(201);
      await as.ADMIN.delete(`/api/v1/invoices/${inv.body.id}`).expect(204);

      const res = await as.ADMIN.delete(`/api/v1/products/${product.id}`).expect(409);
      expect(res.body.message).toContain('1 invoice line');
      await as.ADMIN.delete(`/api/v1/categories/${cat.id}`).expect(409);
      await as.ADMIN.delete(`/api/v1/parties/${party.id}`).expect(409);
    });

    it('every master has the route', async () => {
      for (const path of [
        'categories',
        'products',
        'parties',
        'sub-parties',
        'cities',
        'salespersons',
        'banks',
      ]) {
        await as.ADMIN.delete(`/api/v1/${path}/missing-id`).expect(404);
      }
    });
  });

  describe('products', () => {
    let pulses: { id: string };

    beforeAll(async () => {
      pulses = await create('categories', { name: 'Pulses', commissionRate: '0.005' });
      await t.prisma.setting.update({
        where: { id: 1 },
        data: { defaultCommissionRate: '0.0035' },
      });
    });

    it('derives pack weight and the effective commission rate (spec §6.1)', async () => {
      const ghee = await post('ADMIN', 'products', {
        sku: 101,
        name: 'GHEE 0.5KG x 12',
        unitWeightKg: '0.5',
        packPcs: 12,
        categoryId: pulses.id,
      }).expect(201);
      expect(ghee.body).toMatchObject({
        unitWeightKg: '0.5',
        packWeightKg: '6',
        commissionRate: null,
        effectiveCommissionRate: '0.005', // category rate
        category: { id: pulses.id, name: 'Pulses' },
      });

      const override = await post('ADMIN', 'products', {
        sku: 102,
        name: 'DAAL MOONG 25KG',
        unitWeightKg: 25,
        categoryId: pulses.id,
        commissionRate: '0.01',
      }).expect(201);
      expect(override.body).toMatchObject({
        packPcs: 1,
        packWeightKg: '25',
        effectiveCommissionRate: '0.01',
      });

      const other = await create('categories', { name: 'Other' });
      const fallback = await post('ADMIN', 'products', {
        sku: 103,
        name: 'BAG',
        unitWeightKg: 10,
        packPcs: 4,
        categoryId: other.id,
      }).expect(201);
      expect(fallback.body).toMatchObject({
        packWeightKg: '40',
        effectiveCommissionRate: '0.0035',
      }); // settings default
    });

    it('product # is unique', async () => {
      const res = await post('ADMIN', 'products', {
        sku: 101,
        name: 'Another',
        unitWeightKg: 1,
        categoryId: pulses.id,
      }).expect(409);
      expect(res.body.message).toBe('Product # 101 already exists.');
    });

    it('requires an existing, active category', async () => {
      const res = await post('ADMIN', 'products', {
        sku: 999,
        name: 'Orphan',
        unitWeightKg: 1,
        categoryId: 'nope',
      }).expect(400);
      expect(res.body.message).toBe('Select an active category.');
    });

    it('search matches name or product #, and options carry invoice data', async () => {
      const bySku = await as.USER.get('/api/v1/products?search=102').expect(200);
      expect(bySku.body.data.map((p: { sku: number }) => p.sku)).toEqual([102]);
      const byName = await as.USER.get('/api/v1/products?search=ghee').expect(200);
      expect(byName.body.data.map((p: { sku: number }) => p.sku)).toEqual([101]);

      const options = await as.USER.get('/api/v1/products/options').expect(200);
      expect(options.body.find((o: { sku: number }) => o.sku === 101)).toEqual({
        id: expect.any(String),
        name: 'GHEE 0.5KG x 12',
        sku: 101,
        packWeightKg: '6',
        effectiveCommissionRate: '0.005',
        categoryId: pulses.id,
      });
    });

    it('PATCH only changes what is sent (no default packPcs reset)', async () => {
      const list = await as.ADMIN.get('/api/v1/products?search=101').expect(200);
      const id = list.body.data[0].id as string;
      const res = await as.ADMIN.patch(`/api/v1/products/${id}`)
        .send({ name: 'GHEE 0.5KG x 12 TIN' })
        .expect(200);
      expect(res.body).toMatchObject({ packPcs: 12, packWeightKg: '6' });
    });
  });

  describe('parties & sub-parties', () => {
    it('party: opening balance and default city', async () => {
      const city = await create('cities', { name: 'Chakwal' });
      const res = await post('ADMIN', 'parties', {
        name: 'Pak Rice Traders',
        cityId: city.id,
        openingBalance: '150000.50',
      }).expect(201);
      expect(res.body).toMatchObject({
        openingBalance: '150000.5',
        city: { id: city.id, name: 'Chakwal' },
      });

      const options = await as.USER.get('/api/v1/parties/options').expect(200);
      expect(options.body).toContainEqual({
        id: res.body.id,
        name: 'Pak Rice Traders',
        cityId: city.id,
      });
    });

    it('sub-party names are unique per party and among unassigned ones', async () => {
      const a = await create('parties', { name: 'Party A' });
      const b = await create('parties', { name: 'Party B' });
      await create('sub-parties', { name: 'Dina', partyId: a.id });
      await post('ADMIN', 'sub-parties', { name: 'DINA', partyId: a.id }).expect(409);
      await post('ADMIN', 'sub-parties', { name: 'Dina', partyId: b.id }).expect(201);
      await post('ADMIN', 'sub-parties', { name: 'Dina' }).expect(201);
      await post('ADMIN', 'sub-parties', { name: 'dina' }).expect(409); // NULL parent still clashes

      const options = await as.USER.get(`/api/v1/sub-parties/options?partyId=${a.id}`).expect(200);
      const parents = options.body.map((o: { partyId: string | null }) => o.partyId);
      expect(parents).toContain(a.id);
      expect(parents).toContain(null);
      expect(parents).not.toContain(b.id);
    });

    it('moving a sub-party to a party that already has that name is a 409', async () => {
      const c = await create('parties', { name: 'Party C' });
      const d = await create('parties', { name: 'Party D' });
      await create('sub-parties', { name: 'Jhelum', partyId: c.id });
      const sub = await create('sub-parties', { name: 'Jhelum', partyId: d.id });
      await as.ADMIN.patch(`/api/v1/sub-parties/${sub.id}`).send({ partyId: c.id }).expect(409);
    });
  });

  describe('audit', () => {
    it('logs create, update and status changes with before/after', async () => {
      const sp = await create('salespersons', { name: 'Farhan Khalid', phone: '0300-1234567' });
      await as.ADMIN.patch(`/api/v1/salespersons/${sp.id}`)
        .send({ phone: '0301-0000000' })
        .expect(200);
      await as.ADMIN.patch(`/api/v1/salespersons/${sp.id}/status`)
        .send({ isActive: false })
        .expect(200);

      const entries = await t.prisma.auditLog.findMany({
        where: { entity: 'Salesperson', entityId: sp.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries.map((e) => e.action)).toEqual(['CREATE', 'UPDATE', 'UPDATE']);
      expect(entries[1]).toMatchObject({
        before: expect.objectContaining({ phone: '0300-1234567' }),
        after: expect.objectContaining({ phone: '0301-0000000' }),
      });
      expect(entries[2]?.after).toMatchObject({ isActive: false });
    });
  });

  it('lists paginate and sort', async () => {
    const res = await as.USER.get('/api/v1/cities?pageSize=2&sort=name:desc').expect(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2 });
    const names = res.body.data.map((c: { name: string }) => c.name);
    expect(names).toEqual([...names].sort().reverse());
  });
});
