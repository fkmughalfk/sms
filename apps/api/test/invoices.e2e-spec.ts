import type { Role } from '@sms/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

describe('invoices (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role, Agent>;
  const ids: Record<string, string> = {};
  let userId = '';

  const GOLDEN = [
    { key: 'masar', name: 'MASAR SABIT 25KG', bags: 30, rate: '8000' },
    { key: 'mash', name: 'DAAL MASH CHARI 25KG', bags: 20, rate: '16250' },
    { key: 'moong', name: 'DAAL MOONG 25KG', bags: 30, rate: '10250' },
    { key: 'masoor', name: 'DALL MASOOR 25KG', bags: 20, rate: '8400' },
    { key: 'channa', name: 'DAAL CHANNA SUPREME 25KG', bags: 100, rate: '9950' },
  ];

  const invoice15 = () => ({
    invoiceNo: 15,
    invoiceDate: '2026-09-02',
    partyId: ids.party,
    cityId: ids.city,
    subPartyId: ids.sub,
    salespersonId: ids.asm,
    lines: GOLDEN.map((g) => ({ productId: ids[g.key], qtyPacks: g.bags, rate40Kg: g.rate })),
  });

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('SUPER_ADMIN', 'super@waqar.pk');
    await t.createUser('ADMIN', 'admin@waqar.pk');
    userId = (await t.createUser('USER', 'user@waqar.pk')).id;
    await t.createUser('USER', 'other@waqar.pk');
    as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    as.USER = await t.loginAs('user@waqar.pk');

    const p = t.prisma;
    await p.setting.update({ where: { id: 1 }, data: { defaultCommissionRate: '0.0035' } });
    const pulses = await p.category.create({ data: { name: 'Pulses' } });
    ids.pulses = pulses.id;
    let sku = 1;
    for (const g of GOLDEN) {
      ids[g.key] = (
        await p.product.create({
          data: { sku: sku++, name: g.name, unitWeightKg: 25, categoryId: pulses.id },
        })
      ).id;
    }
    const rice = await p.category.create({ data: { name: 'Rice', commissionRate: '0.005' } });
    ids.riceCategory = rice.id;
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
    ids.city = (await p.city.create({ data: { name: 'Dina' } })).id;
    ids.party = (await p.party.create({ data: { name: 'Pak Rice Traders', cityId: ids.city } })).id;
    ids.otherParty = (await p.party.create({ data: { name: 'Tayyab Traders' } })).id;
    ids.sub = (await p.subParty.create({ data: { name: 'Dina Branch', partyId: ids.party } })).id;
    ids.otherSub = (
      await p.subParty.create({ data: { name: 'Chakwal', partyId: ids.otherParty } })
    ).id;
    ids.asm = (await p.salesperson.create({ data: { name: 'Farhan Khalid' } })).id;
  });

  afterAll(() => t.close());

  describe('golden test — invoice #15 (spec §6.4)', () => {
    it('saves with exactly the spreadsheet numbers', async () => {
      const res = await as.ADMIN.post('/api/v1/invoices').send(invoice15()).expect(201);
      ids.inv15 = res.body.id;

      expect(res.body).toMatchObject({
        invoiceNo: 15,
        invoiceDate: '2026-09-02',
        party: { name: 'Pak Rice Traders' },
        city: { name: 'Dina' },
        salesperson: { name: 'Farhan Khalid' },
        totalPacks: 200,
        totalAmount: '1272188',
        totalCommission: '4452.658',
        totalWeightKg: '5000',
        lineCount: 5,
        canEdit: true,
        canDelete: true,
      });
      expect(
        res.body.lines.map((l: Record<string, string>) => [
          l.ratePerPack,
          l.amount,
          l.commission,
          l.weightKg,
        ]),
      ).toEqual([
        ['5000', '150000', '525', '750'],
        ['10156.25', '203125', '710.9375', '500'],
        ['6406.25', '192188', '672.658', '750'],
        ['5250', '105000', '367.5', '500'],
        ['6218.75', '621875', '2176.5625', '2500'],
      ]);
      expect(
        res.body.lines.every((l: { commissionRate: string }) => l.commissionRate === '0.0035'),
      ).toBe(true);
    });

    it('stores the same numbers in the database (Decimal, not float)', async () => {
      const inv = await t.prisma.invoice.findUniqueOrThrow({ where: { id: ids.inv15 } });
      expect(inv.totalAmount.toString()).toBe('1272188');
      expect(inv.totalCommission.toString()).toBe('4452.658');
    });

    it('ignores calculated values sent by the client (rule 2)', async () => {
      const body = {
        ...invoice15(),
        invoiceNo: 16,
        totalAmount: 1,
        lines: invoice15().lines.map((l) => ({
          ...l,
          amount: 1,
          commission: 999,
          packWeightKg: 1,
        })),
      };
      const res = await as.ADMIN.post('/api/v1/invoices').send(body).expect(201);
      expect(res.body.totalAmount).toBe('1272188');
      await as.ADMIN.delete(`/api/v1/invoices/${res.body.id}`).expect(204);
    });

    it('preview returns the same numbers without saving', async () => {
      const before = await t.prisma.invoice.count();
      const res = await as.USER.post('/api/v1/invoices/preview')
        .send({ ...invoice15(), invoiceNo: 999 })
        .expect(200);
      expect(res.body.totals).toMatchObject({
        totalPacks: 200,
        totalAmount: '1272188',
        totalCommission: '4452.658',
        tons: '5',
        avgPerTon: '254437.6',
        avgPerPack: '6360.94',
      });
      expect(await t.prisma.invoice.count()).toBe(before);
    });
  });

  describe('validation & rules', () => {
    it('a taken invoice number is a 409 that names the existing invoice', async () => {
      const res = await as.ADMIN.post('/api/v1/invoices').send(invoice15()).expect(409);
      expect(res.body).toEqual({
        statusCode: 409,
        message: 'Invoice 15 already exists.',
        code: 'INVOICE_EXISTS',
        invoiceId: ids.inv15,
      });
    });

    it('uses the Excel ValidateForm messages', async () => {
      const res = await as.ADMIN.post('/api/v1/invoices')
        .send({
          invoiceNo: '',
          invoiceDate: '',
          partyId: '',
          lines: [{ productId: ids.masar, qtyPacks: '0', rate40Kg: '' }],
        })
        .expect(400);
      expect(res.body.errors.map((e: { message: string }) => e.message)).toEqual([
        'Enter the Invoice No.',
        'Enter the Invoice Date.',
        'Enter the Party (Name).',
        'Line 1: enter Qty (Packs).',
        'Line 1: enter Rate 40Kg.',
      ]);
    });

    it('rejects a sub-party that belongs to another party', async () => {
      const res = await as.ADMIN.post('/api/v1/invoices')
        .send({ ...invoice15(), invoiceNo: 30, subPartyId: ids.otherSub })
        .expect(400);
      expect(res.body.message).toBe('Select a sub-party of this party.');
    });

    it('rejects inactive products on new lines', async () => {
      const old = await t.prisma.product.create({
        data: {
          sku: 77,
          name: 'OLD PRODUCT',
          unitWeightKg: 5,
          categoryId: ids.pulses!,
          isActive: false,
        },
      });
      const res = await as.ADMIN.post('/api/v1/invoices')
        .send({
          ...invoice15(),
          invoiceNo: 31,
          lines: [{ productId: old.id, qtyPacks: 1, rate40Kg: 100 }],
        })
        .expect(400);
      expect(res.body.message).toBe('Line 1: select an active product.');
    });

    it('next-number suggests max + 1 (deleted numbers stay reserved)', async () => {
      const res = await as.USER.get('/api/v1/invoices/next-number').expect(200);
      expect(res.body).toEqual({ invoiceNo: 17 }); // 16 was created then soft-deleted
      const reuse = await as.ADMIN.post('/api/v1/invoices')
        .send({ ...invoice15(), invoiceNo: 16 })
        .expect(409);
      expect(reuse.body.invoiceId).toBeNull();
    });
  });

  describe('snapshots (rule 4)', () => {
    it('editing a product later does not change saved invoices', async () => {
      await t.prisma.product.update({
        where: { id: ids.moong },
        data: { unitWeightKg: 50, commissionRate: '0.01' },
      });
      const res = await as.ADMIN.get(`/api/v1/invoices/${ids.inv15}`).expect(200);
      expect(res.body.totalAmount).toBe('1272188');
      expect(res.body.lines[2]).toMatchObject({
        packWeightKg: '25',
        commissionRate: '0.0035',
        amount: '192188',
      });
    });

    it('re-saving keeps existing lines’ snapshots; new lines snapshot current values', async () => {
      const body = {
        ...invoice15(),
        remarks: 'Re-saved after product change',
        lines: [...invoice15().lines, { productId: ids.rice, qtyPacks: 10, rate40Kg: '5000' }],
      };
      const res = await as.ADMIN.put(`/api/v1/invoices/${ids.inv15}`).send(body).expect(200);
      expect(res.body.lines[2]).toMatchObject({
        packWeightKg: '25',
        commissionRate: '0.0035',
        amount: '192188',
      });
      // ZAFARANI: pack 10 × 4 = 40 KG, Rice category rate 0.5% → 5000/40×40×10 = 50,000; commission 250
      expect(res.body.lines[5]).toMatchObject({
        packWeightKg: '40',
        commissionRate: '0.005',
        amount: '50000',
        commission: '250',
      });
      expect(res.body.totalAmount).toBe('1322188');

      // Put it back to the golden version for later tests.
      await as.ADMIN.put(`/api/v1/invoices/${ids.inv15}`).send(invoice15()).expect(200);
      await t.prisma.product.update({
        where: { id: ids.moong },
        data: { unitWeightKg: 25, commissionRate: null },
      });
    });
  });

  describe('permissions (spec §3)', () => {
    let ownId = '';

    it('USER can create; can edit own invoice inside the window; cannot delete', async () => {
      const res = await as.USER.post('/api/v1/invoices')
        .send({
          ...invoice15(),
          invoiceNo: 40,
          lines: [{ productId: ids.masar, qtyPacks: 1, rate40Kg: 8000 }],
        })
        .expect(201);
      ownId = res.body.id;
      expect(res.body).toMatchObject({ canEdit: true, canDelete: false, totalAmount: '5000' });

      await as.USER.put(`/api/v1/invoices/${ownId}`)
        .send({
          ...invoice15(),
          invoiceNo: 40,
          lines: [{ productId: ids.masar, qtyPacks: 2, rate40Kg: 8000 }],
        })
        .expect(200);
      await as.USER.delete(`/api/v1/invoices/${ownId}`).expect(403);
    });

    it('USER cannot edit own invoice after the edit window', async () => {
      await t.prisma.invoice.update({
        where: { id: ownId },
        data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
      });
      const res = await as.USER.put(`/api/v1/invoices/${ownId}`)
        .send({
          ...invoice15(),
          invoiceNo: 40,
          lines: [{ productId: ids.masar, qtyPacks: 3, rate40Kg: 8000 }],
        })
        .expect(403);
      expect(res.body.message).toBe(
        'You can only edit your own invoices within 24 hours of creating them.',
      );
      const detail = await as.USER.get(`/api/v1/invoices/${ownId}`).expect(200);
      expect(detail.body.canEdit).toBe(false);
    });

    it('USER only sees invoices they created (unlinked) — others are 404', async () => {
      const list = await as.USER.get('/api/v1/invoices').expect(200);
      expect(list.body.data.map((i: { invoiceNo: number }) => i.invoiceNo)).toEqual([40]);
      await as.USER.get(`/api/v1/invoices/${ids.inv15}`).expect(404);
      await as.USER.put(`/api/v1/invoices/${ids.inv15}`).send(invoice15()).expect(404);
    });

    it('a USER linked to a salesperson also sees that salesperson’s invoices', async () => {
      await t.prisma.user.update({ where: { id: userId }, data: { salespersonId: ids.asm } });
      const list = await as.USER.get('/api/v1/invoices').expect(200);
      expect(list.body.data.map((i: { invoiceNo: number }) => i.invoiceNo).sort()).toEqual([
        15, 40,
      ]);
      // …but still cannot edit someone else's invoice.
      await as.USER.put(`/api/v1/invoices/${ids.inv15}`).send(invoice15()).expect(403);
      await t.prisma.user.update({ where: { id: userId }, data: { salespersonId: null } });
    });

    it('ADMIN can edit any invoice and soft-delete it', async () => {
      const res = await as.ADMIN.post('/api/v1/invoices')
        .send({
          ...invoice15(),
          invoiceNo: 41,
          lines: [{ productId: ids.masar, qtyPacks: 1, rate40Kg: 8000 }],
        })
        .expect(201);
      await as.ADMIN.delete(`/api/v1/invoices/${res.body.id}`).expect(204);
      await as.ADMIN.get(`/api/v1/invoices/${res.body.id}`).expect(404);
      const row = await t.prisma.invoice.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.deletedAt).not.toBeNull(); // soft delete (rule 6)
      const audit = await t.prisma.auditLog.findMany({
        where: { entity: 'Invoice', entityId: res.body.id },
      });
      expect(audit.map((a) => a.action).sort()).toEqual(['CREATE', 'DELETE']);
    });

    it('export is ADMIN+ only', async () => {
      await as.USER.get('/api/v1/invoices/export').expect(403);
    });
  });

  describe('list, lines, totals & export (spec §5.3)', () => {
    beforeAll(async () => {
      // A second invoice in October for another party.
      await as.ADMIN.post('/api/v1/invoices')
        .send({
          invoiceNo: 50,
          invoiceDate: '2026-10-01',
          partyId: ids.otherParty,
          lines: [{ productId: ids.rice, qtyPacks: 5, rate40Kg: '4000' }],
        })
        .expect(201);
    });

    it('filters by month and totals the Database footer figures', async () => {
      const res = await as.ADMIN.get('/api/v1/invoices?month=2026-09&partyId=' + ids.party).expect(
        200,
      );
      expect(res.body.data.map((i: { invoiceNo: number }) => i.invoiceNo)).toEqual([40, 15]);
      const oct = await as.ADMIN.get('/api/v1/invoices?month=2026-10').expect(200);
      expect(oct.body.data.map((i: { invoiceNo: number }) => i.invoiceNo)).toEqual([50]);

      const only15 = await as.ADMIN.get('/api/v1/invoices?invoiceNo=15').expect(200);
      expect(only15.body.totals).toEqual({
        invoices: 1,
        totalPacks: 200,
        totalWeightKg: '5000',
        tons: '5',
        totalAmount: '1272188',
        totalCommission: '4452.658',
        avgPerTon: '254437.6',
        avgPerPack: '6360.94',
      });
    });

    it('lines view: one row per line, filterable by product and category', async () => {
      const res = await as.ADMIN.get('/api/v1/invoices/lines?invoiceNo=15').expect(200);
      expect(res.body.meta.total).toBe(5);
      expect(res.body.data[0]).toMatchObject({
        invoiceNo: 15,
        lineNo: 1,
        product: { name: 'MASAR SABIT 25KG' },
        category: { name: 'Pulses' },
        amount: '150000',
      });

      const moong = await as.ADMIN.get(`/api/v1/invoices/lines?productId=${ids.moong}`).expect(200);
      expect(moong.body.totals).toMatchObject({
        invoices: 1,
        totalPacks: 30,
        totalAmount: '192188',
      });

      const rice = await as.ADMIN.get(
        `/api/v1/invoices/lines?categoryId=${ids.riceCategory}`,
      ).expect(200);
      expect(rice.body.data.map((l: { invoiceNo: number }) => l.invoiceNo)).toEqual([50]);
    });

    it('exports the filtered lines as .xlsx with a totals row', async () => {
      const res = await as.ADMIN.get('/api/v1/invoices/export?invoiceNo=15')
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as unknown as ArrayBuffer);
      const ws = wb.getWorksheet('Lines')!;
      expect(ws.rowCount).toBe(7); // header + 5 lines + total
      const total = ws.getRow(7);
      expect(total.getCell(13).value).toBe(1272188); // Amount
      expect(total.getCell(9).value).toBe(200); // Bags
    });
  });
});
