import { auditDiff, type Role } from '@sms/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

describe('settings & audit log (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role, Agent>;
  let superId = '';
  let productId = '';
  let partyId = '';

  beforeAll(async () => {
    t = await createTestApp();
    superId = (await t.createUser('SUPER_ADMIN', 'super@waqar.pk')).id;
    await t.createUser('ADMIN', 'admin@waqar.pk');
    await t.createUser('USER', 'user@waqar.pk');
    as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    as.USER = await t.loginAs('user@waqar.pk');
    const cat = await t.prisma.category.create({ data: { name: 'Pulses' } });
    productId = (
      await t.prisma.product.create({
        data: { sku: 1, name: 'MASAR SABIT 25KG', unitWeightKg: 25, categoryId: cat.id },
      })
    ).id;
    partyId = (await t.prisma.party.create({ data: { name: 'Pak Rice Traders' } })).id;
  });

  afterAll(() => t.close());

  describe('settings (spec §5.8)', () => {
    it('every role can read them', async () => {
      const res = await as.USER.get('/api/v1/settings').expect(200);
      expect(res.body).toMatchObject({
        companyName: 'WAQAR RICE MILLS',
        defaultCommissionRate: '0.0035',
      });
    });

    it('only SUPER_ADMIN can change them', async () => {
      await as.USER.patch('/api/v1/settings').send({ companyName: 'X' }).expect(403);
      await as.ADMIN.patch('/api/v1/settings').send({ companyName: 'X' }).expect(403);
    });

    it('validates input', async () => {
      const res = await as.SUPER_ADMIN.patch('/api/v1/settings')
        .send({ fiscalYearStartMonth: 13, userEditWindowHours: -1, defaultCommissionRate: '2' })
        .expect(400);
      expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual([
        'defaultCommissionRate',
        'fiscalYearStartMonth',
        'userEditWindowHours',
      ]);
    });

    it('a new default rate applies to invoices saved from now on — old ones keep their snapshot', async () => {
      const line = [{ productId, qtyPacks: 30, rate40Kg: 8000 }]; // 150,000
      const before = await as.ADMIN.post('/api/v1/invoices')
        .send({ invoiceNo: 1, invoiceDate: '2026-09-02', partyId, lines: line })
        .expect(201);
      expect(before.body.totalCommission).toBe('525');

      const res = await as.SUPER_ADMIN.patch('/api/v1/settings')
        .send({
          companyName: 'Waqar Rice Mills (Pvt) Ltd',
          companyAddress: '',
          defaultCommissionRate: '0.005',
          annualSalesTarget: '360000000',
          fiscalYearStartMonth: '7',
          userEditWindowHours: '48',
        })
        .expect(200);
      expect(res.body).toEqual({
        companyName: 'Waqar Rice Mills (Pvt) Ltd',
        companyAddress: '',
        defaultCommissionRate: '0.005',
        annualSalesTarget: '360000000',
        fiscalYearStartMonth: 7,
        userEditWindowHours: 48,
      });

      const after = await as.ADMIN.post('/api/v1/invoices')
        .send({ invoiceNo: 2, invoiceDate: '2026-09-03', partyId, lines: line })
        .expect(201);
      expect(after.body.totalCommission).toBe('750');
      const old = await as.ADMIN.get(`/api/v1/invoices/${before.body.id}`).expect(200);
      expect(old.body.totalCommission).toBe('525');

      const target = await as.ADMIN.get(
        '/api/v1/reports/dashboard?from=2026-07-01&to=2027-06-30',
      ).expect(200);
      expect(target.body.target).toMatchObject({
        annualTarget: '360000000',
        monthlyTarget: '30000000',
      });
    });

    it('partial updates leave other settings alone', async () => {
      const res = await as.SUPER_ADMIN.patch('/api/v1/settings')
        .send({ userEditWindowHours: 24 })
        .expect(200);
      expect(res.body).toMatchObject({
        userEditWindowHours: 24,
        defaultCommissionRate: '0.005',
        fiscalYearStartMonth: 7,
      });
    });
  });

  describe('audit log (spec §5.9)', () => {
    it('USER cannot read it; ADMIN and SUPER_ADMIN can', async () => {
      await as.USER.get('/api/v1/audit').expect(403);
      await as.ADMIN.get('/api/v1/audit').expect(200);
      await as.SUPER_ADMIN.get('/api/v1/audit').expect(200);
    });

    it('records settings changes with a before/after diff', async () => {
      const res = await as.ADMIN.get('/api/v1/audit?entity=Setting').expect(200);
      expect(res.body.meta.total).toBe(2);
      const first = res.body.data[1]; // newest first
      expect(first).toMatchObject({
        action: 'UPDATE',
        entity: 'Setting',
        user: { id: superId, name: expect.any(String), email: 'super@waqar.pk' },
      });
      const changed = auditDiff(first.before, first.after).map((d) => d.field);
      expect(changed).toEqual(
        expect.arrayContaining([
          'companyName',
          'defaultCommissionRate',
          'annualSalesTarget',
          'fiscalYearStartMonth',
        ]),
      );
    });

    it('records logins, invoice writes, and filters by action, user and entity id', async () => {
      const logins = await as.ADMIN.get('/api/v1/audit?action=LOGIN').expect(200);
      expect(logins.body.meta.total).toBeGreaterThanOrEqual(3);
      const mine = await as.ADMIN.get(`/api/v1/audit?userId=${superId}&action=LOGIN`).expect(200);
      expect(mine.body.data.every((e: { user: { id: string } }) => e.user.id === superId)).toBe(
        true,
      );

      const inv = await t.prisma.invoice.findUniqueOrThrow({ where: { invoiceNo: 1 } });
      const forInvoice = await as.ADMIN.get(
        `/api/v1/audit?entity=Invoice&entityId=${inv.id}`,
      ).expect(200);
      expect(forInvoice.body.data.map((e: { action: string }) => e.action)).toEqual(['CREATE']);
    });

    it('filters by business date (Asia/Karachi)', async () => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(
        new Date(),
      );
      const todayRes = await as.ADMIN.get(`/api/v1/audit?from=${today}&to=${today}`).expect(200);
      expect(todayRes.body.meta.total).toBeGreaterThan(0);
      const past = await as.ADMIN.get('/api/v1/audit?from=2020-01-01&to=2020-01-31').expect(200);
      expect(past.body.meta.total).toBe(0);
    });
  });
});
