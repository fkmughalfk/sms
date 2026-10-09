import type { Role } from '@sms/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

/**
 * Hand-worked scenario (spec §13 phase 5: "Outstanding numbers match manual calculation").
 *
 * Party A — opening balance 150,000.50
 *   2026-09-02  Invoice 101   30 bags × 5,000 = 150,000.00   balance 300,000.50
 *   2026-09-05  Payment 4411 (HBL)          −100,000.00      balance 200,000.50
 *   2026-09-10  Invoice 102   20 bags × 10,156.25 = 203,125   balance 403,125.50
 *   2026-09-10  Payment (Cash)              −50,000.25       balance 353,125.25
 *   + Invoice 103 (50,000) and a 99,999 payment, both deleted → ignored
 *   Invoiced 503,125.50 · Recovered 150,000.25 · Outstanding 353,125.25
 *
 * Party B — Invoice 104 (5,000), paid 6,000 → outstanding −1,000 (advance)
 * Party C — active, no activity → listed with zeros
 * Party D — inactive, no activity → not listed
 */
describe('payments & recovery (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role, Agent>;
  const ids: Record<string, string> = {};

  const invoice = (
    invoiceNo: number,
    partyId: string,
    invoiceDate: string,
    bags: number,
    rate: number,
  ) =>
    as.ADMIN.post('/api/v1/invoices')
      .send({
        invoiceNo,
        invoiceDate,
        partyId,
        lines: [{ productId: ids.product, qtyPacks: bags, rate40Kg: rate }],
      })
      .expect(201)
      .then((r) => r.body.id as string);

  const pay = (agent: Agent, body: Record<string, unknown>) =>
    agent.post('/api/v1/payments').send(body);

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('SUPER_ADMIN', 'super@waqar.pk');
    await t.createUser('ADMIN', 'admin@waqar.pk');
    await t.createUser('USER', 'user@waqar.pk');
    as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    as.USER = await t.loginAs('user@waqar.pk');

    const p = t.prisma;
    const pulses = await p.category.create({ data: { name: 'Pulses' } });
    ids.product = (
      await p.product.create({
        data: { sku: 1, name: 'DAAL 25KG', unitWeightKg: 25, categoryId: pulses.id },
      })
    ).id;
    ids.hbl = (await p.bank.create({ data: { name: 'HBL' } })).id;
    ids.cash = (await p.bank.create({ data: { name: 'Cash' } })).id;
    ids.a = (await p.party.create({ data: { name: 'Party A', openingBalance: '150000.50' } })).id;
    ids.b = (await p.party.create({ data: { name: 'Party B' } })).id;
    ids.c = (await p.party.create({ data: { name: 'Party C' } })).id;
    ids.d = (await p.party.create({ data: { name: 'Party D', isActive: false } })).id;
    ids.subA = (await p.subParty.create({ data: { name: 'Dina', partyId: ids.a } })).id;
    ids.subB = (await p.subParty.create({ data: { name: 'Jhelum', partyId: ids.b } })).id;

    await invoice(101, ids.a, '2026-09-02', 30, 8000); // 150,000
    await invoice(102, ids.a, '2026-09-10', 20, 16250); // 203,125
    const deleted = await invoice(103, ids.a, '2026-09-11', 10, 8000); // 50,000 — deleted below
    await as.ADMIN.delete(`/api/v1/invoices/${deleted}`).expect(204);
    await invoice(104, ids.b, '2026-09-03', 1, 8000); // 5,000
  });

  afterAll(() => t.close());

  describe('recording payments', () => {
    it('USER can record a payment (spec §3)', async () => {
      const res = await pay(as.USER, {
        paymentDate: '2026-09-05',
        partyId: ids.a,
        subPartyId: ids.subA,
        slipNo: ' 4411 ',
        bankId: ids.hbl,
        amount: '100000',
        remarks: 'Cheque',
      }).expect(201);
      ids.payA1 = res.body.id;
      expect(res.body).toMatchObject({
        paymentDate: '2026-09-05',
        party: { name: 'Party A' },
        subParty: { name: 'Dina' },
        slipNo: '4411',
        bank: { name: 'HBL' },
        amount: '100000',
        createdBy: { name: expect.stringContaining('user@waqar.pk') },
      });
    });

    it('ADMIN records the rest', async () => {
      ids.payA2 = (
        await pay(as.ADMIN, {
          paymentDate: '2026-09-10',
          partyId: ids.a,
          bankId: ids.cash,
          amount: '50000.25',
        }).expect(201)
      ).body.id;
      ids.payB = (
        await pay(as.ADMIN, { paymentDate: '2026-09-04', partyId: ids.b, amount: 6000 }).expect(201)
      ).body.id;
      const doomed = await pay(as.ADMIN, {
        paymentDate: '2026-09-06',
        partyId: ids.a,
        amount: 99999,
      }).expect(201);
      await as.ADMIN.delete(`/api/v1/payments/${doomed.body.id}`).expect(204);
    });

    it('uses the Excel SavePayment messages', async () => {
      const res = await pay(as.USER, { paymentDate: '', partyId: '', amount: '0' }).expect(400);
      expect(res.body.errors.map((e: { message: string }) => e.message)).toEqual([
        'Enter a date.',
        'Select a party.',
        'Enter a valid amount.',
      ]);
    });

    it('rejects a sub-party of another party and an inactive bank', async () => {
      const sub = await pay(as.ADMIN, {
        paymentDate: '2026-09-05',
        partyId: ids.a,
        subPartyId: ids.subB,
        amount: 1,
      }).expect(400);
      expect(sub.body.message).toBe('Select a sub-party of this party.');
      const oldBank = await t.prisma.bank.create({
        data: { name: 'Closed Bank', isActive: false },
      });
      const bank = await pay(as.ADMIN, {
        paymentDate: '2026-09-05',
        partyId: ids.a,
        bankId: oldBank.id,
        amount: 1,
      }).expect(400);
      expect(bank.body.message).toBe('Select an active bank.');
    });
  });

  describe('party position (Payments F5:G8)', () => {
    it('matches the hand calculation for Party A', async () => {
      const res = await as.USER.get(`/api/v1/recovery/parties/${ids.a}/position`).expect(200);
      expect(res.body).toEqual({
        party: { id: ids.a, name: 'Party A' },
        openingBalance: '150000.5',
        sales: '353125',
        invoiced: '503125.5',
        recovered: '150000.25',
        outstanding: '353125.25',
        recoveryRate: expect.stringMatching(/^0\.2981/),
        lastPaymentDate: '2026-09-10',
      });
    });

    it('shows an advance as negative outstanding (Party B)', async () => {
      const res = await as.USER.get(`/api/v1/recovery/parties/${ids.b}/position`).expect(200);
      expect(res.body).toMatchObject({ invoiced: '5000', recovered: '6000', outstanding: '-1000' });
    });

    it('updates when a payment is edited (ADMIN) and keeps an audit trail', async () => {
      await as.ADMIN.patch(`/api/v1/payments/${ids.payA2}`)
        .send({ amount: '60000.25' })
        .expect(200);
      let res = await as.ADMIN.get(`/api/v1/recovery/parties/${ids.a}/position`).expect(200);
      expect(res.body.outstanding).toBe('343125.25');

      await as.ADMIN.patch(`/api/v1/payments/${ids.payA2}`)
        .send({ amount: '50000.25' })
        .expect(200);
      res = await as.ADMIN.get(`/api/v1/recovery/parties/${ids.a}/position`).expect(200);
      expect(res.body.outstanding).toBe('353125.25');

      const audit = await t.prisma.auditLog.findMany({
        where: { entity: 'Payment', entityId: ids.payA2 },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual(['CREATE', 'UPDATE', 'UPDATE']);
      expect(audit[1]).toMatchObject({
        before: expect.objectContaining({ amount: '50000.25' }),
        after: expect.objectContaining({ amount: '60000.25' }),
      });
    });

    it('unknown party → 404', async () => {
      await as.USER.get('/api/v1/recovery/parties/nope/position').expect(404);
    });
  });

  describe('recovery summary (Payments J20:N…)', () => {
    it('lists parties by outstanding with matching totals', async () => {
      const res = await as.USER.get('/api/v1/recovery/parties').expect(200);
      expect(
        res.body.data.map((r: { party: { name: string }; outstanding: string }) => [
          r.party.name,
          r.outstanding,
        ]),
      ).toEqual([
        ['Party A', '353125.25'],
        ['Party C', '0'],
        ['Party B', '-1000'],
      ]); // Party D (inactive, no activity) left out
      expect(res.body.totals).toEqual({
        parties: 3,
        invoiced: '508125.5',
        recovered: '156000.25',
        outstanding: '352125.25',
        recoveryRate: expect.stringMatching(/^0\.307/),
      });
    });

    it('filters to parties that still owe, and by name', async () => {
      const owing = await as.USER.get('/api/v1/recovery/parties?outstandingOnly=true').expect(200);
      expect(owing.body.data.map((r: { party: { name: string } }) => r.party.name)).toEqual([
        'Party A',
      ]);
      const byName = await as.USER.get('/api/v1/recovery/parties?search=party b').expect(200);
      expect(byName.body.data).toHaveLength(1);
    });
  });

  describe('party ledger', () => {
    it('runs a balance from the opening balance', async () => {
      const res = await as.USER.get(`/api/v1/recovery/parties/${ids.a}/ledger`).expect(200);
      expect(res.body.broughtForward).toBe('150000.5');
      expect(
        res.body.entries.map((e: Record<string, string>) => [
          e.date,
          e.reference,
          e.debit,
          e.credit,
          e.balance,
        ]),
      ).toEqual([
        ['2026-09-02', 'Invoice #101', '150000', '0', '300000.5'],
        ['2026-09-05', 'Slip 4411', '0', '100000', '200000.5'],
        ['2026-09-10', 'Invoice #102', '203125', '0', '403125.5'],
        ['2026-09-10', 'Payment', '0', '50000.25', '353125.25'],
      ]);
      expect(res.body).toMatchObject({
        totalDebit: '353125',
        totalCredit: '150000.25',
        closingBalance: '353125.25',
      });
      expect(res.body.entries[1].description).toBe('HBL · Cheque');
    });

    it('brings earlier activity forward when a start date is given', async () => {
      const res = await as.USER.get(
        `/api/v1/recovery/parties/${ids.a}/ledger?from=2026-09-06&to=2026-09-30`,
      ).expect(200);
      expect(res.body.broughtForward).toBe('200000.5');
      expect(res.body.entries).toHaveLength(2);
      expect(res.body.closingBalance).toBe('353125.25');
    });
  });

  describe('payments list & permissions', () => {
    it('ADMIN sees all payments with totals; filters by party, bank and slip', async () => {
      const all = await as.ADMIN.get('/api/v1/payments?month=2026-09').expect(200);
      expect(all.body.totals).toEqual({ payments: 3, totalAmount: '156000.25' });
      const a = await as.ADMIN.get(`/api/v1/payments?partyId=${ids.a}`).expect(200);
      expect(a.body.data.map((p: { amount: string }) => p.amount)).toEqual(['50000.25', '100000']);
      const hbl = await as.ADMIN.get(`/api/v1/payments?bankId=${ids.hbl}`).expect(200);
      expect(hbl.body.totals.totalAmount).toBe('100000');
      const slip = await as.ADMIN.get('/api/v1/payments?search=4411').expect(200);
      expect(slip.body.data).toHaveLength(1);
    });

    it('USER sees only the payments they recorded', async () => {
      const res = await as.USER.get('/api/v1/payments').expect(200);
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([ids.payA1]);
      await as.USER.get(`/api/v1/payments/${ids.payB}`).expect(404);
    });

    it('USER cannot edit, delete or export payments; ADMIN can', async () => {
      await as.USER.patch(`/api/v1/payments/${ids.payA1}`).send({ amount: 1 }).expect(403);
      await as.USER.delete(`/api/v1/payments/${ids.payA1}`).expect(403);
      await as.USER.get('/api/v1/payments/export').expect(403);
      await as.ADMIN.get('/api/v1/payments/export?month=2026-09').expect(200);
    });

    it('deleting is a soft delete', async () => {
      const res = await pay(as.ADMIN, {
        paymentDate: '2026-09-20',
        partyId: ids.c,
        amount: 10,
      }).expect(201);
      await as.SUPER_ADMIN.delete(`/api/v1/payments/${res.body.id}`).expect(204);
      const row = await t.prisma.payment.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.deletedAt).not.toBeNull();
      await as.ADMIN.get(`/api/v1/payments/${res.body.id}`).expect(404);
    });
  });
});
