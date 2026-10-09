import type { ImportMapping, Role } from '@sms/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

/** A small workbook laid out like the client's (spec §11): Products, Lists, Database, Payments, Sheet1, Dashboard. */
async function workbook(opts: { badInvoiceNo?: boolean } = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const products = wb.addWorksheet('Products');
  products.getCell('A1').value = 'Product List';
  products.getRow(3).values = [
    '#',
    'Product',
    'Unit Weight (KG)',
    'Pack (pcs)',
    'Pack Weight (KG)',
    'Commission Rate',
    0.0035,
    'Category',
    'Comm Rate',
    'Category',
    'Commission Rate',
  ];
  const items: [number, string, number, number, string][] = [
    [1, 'MASAR SABIT 25KG', 25, 1, 'Pulses'],
    [2, 'DAAL MASH CHARI 25KG', 25, 1, 'Pulses'],
    [3, 'DAAL MOONG 25KG', 25, 1, 'Pulses'],
    [4, 'DALL MASOOR 25KG', 25, 1, 'Pulses'],
    [5, 'DAAL CHANNA SUPREME 25KG', 25, 1, 'Pulses'],
    [6, 'ZAFARANI STEAM PLATINUM 10KG', 10, 4, 'Rice'],
  ];
  items.forEach(
    (p, i) =>
      (products.getRow(4 + i).values = [...p.slice(0, 4), p[2] * p[3], null, null, p[4], 0.0035]),
  );
  [
    ['Rice', 0.0035],
    ['Pulses', 0.0035],
    ['Other', 0.0035],
  ].forEach(([n, r], i) => {
    products.getCell(`J${4 + i}`).value = n;
    products.getCell(`K${4 + i}`).value = r;
  });

  const lists = wb.addWorksheet('Lists');
  lists.getRow(1).values = ['Party (Name)', 'City', 'ASM / Salesperson', 'Sub Party', 'Bank'];
  lists.getRow(2).values = ['Pak Rice Traders', 'Dina', 'Farhan Khalid', 'Talha & co Kotla', 'HBL'];
  lists.getRow(3).values = ['Tayyab Traders', 'Chakwal', null, null, 'UBL'];
  lists.getRow(4).values = [null, null, null, null, 'Cash'];

  const db = wb.addWorksheet('Database');
  db.getRow(1).values = [
    'Invoice #',
    'Invoice Date',
    'Party (Name)',
    'Sub Party',
    'City',
    'ASM / Salesperson',
    'Description (Product)',
    'Qty (Packs)',
    'Rate 40Kg',
    'Pack Wt (KG)',
    'Rate / Pack',
    'Amount',
    'Commission',
    'Weight (KG)',
  ];
  const golden: [string, number, number, number][] = [
    ['MASAR SABIT 25KG', 30, 8000, 150000],
    ['DAAL MASH CHARI 25KG', 20, 16250, 203125],
    ['DAAL MOONG 25KG', 30, 10250, 192188],
    ['DALL MASOOR 25KG', 20, 8400, 105000],
    ['DAAL CHANNA SUPREME 25KG', 100, 9950, 621875],
  ];
  // Invoice 15 with the messy names the spec warns about (trailing spaces, case).
  golden.forEach(([prod, qty, rate, amount], i) => {
    db.getRow(2 + i).values = [
      '15',
      new Date(Date.UTC(2026, 8, 2)),
      'Pak Rice Traders ',
      null,
      'Dina ',
      i % 2 ? 'Farhan Khalid ' : 'Farhan Khalid',
      prod,
      qty,
      rate,
      25,
      (rate / 40) * 25,
      amount,
      amount * 0.0035,
      qty * 25,
    ];
  });
  // Invoice 16: Rice 10 KG × 4, for "tayyab traders " (lower case).
  db.getRow(7).values = [
    16,
    '2026-09-03',
    'tayyab traders ',
    'Talha & co Kotla',
    'Chakwal',
    'Farhan Khalid',
    'ZAFARANI STEAM PLATINUM 10KG',
    10,
    5000,
    40,
    5000,
    50000,
    175,
    400,
  ];
  if (opts.badInvoiceNo) {
    db.getRow(8).values = [
      '1111do',
      '2026-09-15',
      'Pak Rice Traders',
      null,
      'Dina',
      'Farhan Khalid',
      'MASAR SABIT 25KG',
      1,
      8000,
      25,
      5000,
      5000,
      17.5,
      25,
    ];
  }

  const pay = wb.addWorksheet('Payments');
  pay.getCell('B19').value = 'PAYMENT ENTRIES';
  pay.getRow(20).values = [
    null,
    'Date',
    'Party (Name)',
    'Sub Party',
    'Slip No.',
    'Bank',
    'Amount',
    'Remarks',
  ];
  pay.getRow(21).values = [
    null,
    '2026-09-05',
    'Pak Rice Traders',
    null,
    '4411',
    'HBL',
    272188,
    'Cheque',
  ];

  const s1 = wb.addWorksheet('Sheet1');
  s1.getRow(4).values = [
    null,
    null,
    null,
    'Date ',
    'Party Name ',
    'Bank ',
    'Tansaction/slip no',
    'Amount ',
    'Discription ',
  ];
  s1.getRow(5).values = [
    null,
    null,
    null,
    '2026-09-05',
    'Pak Rice Traders dina ',
    'HBL',
    '4411',
    272188,
    'same as Payments sheet',
  ]; // duplicate
  s1.getRow(6).values = [
    null,
    null,
    null,
    '2026-09-06',
    'Tayyab Traders Chakwal ',
    'grainco ubl',
    null,
    20000,
    'from app',
  ];
  s1.getRow(7).values = [
    null,
    null,
    null,
    '2026-09-07',
    'Hazrat Hussain Sawat',
    'cash',
    null,
    30000,
    null,
  ];
  s1.getRow(8).values = [null, null, null, '2026-09-08', 'Someone Else', 'cash', null, 999, null];

  const dash = wb.addWorksheet('Dashboard');
  dash.getCell('B7').value = 1322188;
  dash.getCell('E7').value = 4627.658;
  dash.getCell('H7').value = 5.4;
  dash.getCell('K7').value = 2;
  dash.getCell('B20').value = 'SALES BY CATEGORY  —  RICE vs PULSES';
  dash.getCell('B22').value = 'Rice';
  dash.getCell('H22').value = 50000;
  dash.getCell('B23').value = 'Pulses';
  dash.getCell('H23').value = 1272188;
  dash.getCell('B25').value = 'TOTAL';

  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Excel import (e2e)', () => {
  let t: TestApp;
  const as = {} as Record<Role, Agent>;

  beforeAll(async () => {
    t = await createTestApp();
    await t.prisma.category.createMany({
      data: [{ name: 'Rice' }, { name: 'Pulses' }, { name: 'Other' }],
    }); // as seeded
    await t.createUser('SUPER_ADMIN', 'super@waqar.pk');
    await t.createUser('ADMIN', 'admin@waqar.pk');
    as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
  });

  afterAll(() => t.close());

  const upload = (
    agent: Agent,
    file: Buffer,
    dryRun: boolean,
    mapping: ImportMapping = { parties: {}, banks: {} },
  ) =>
    agent
      .post('/api/v1/import/excel')
      .field('dryRun', String(dryRun))
      .field('mapping', JSON.stringify(mapping))
      .attach('file', file, 'workbook.xlsx');

  const MAPPING: ImportMapping = {
    parties: {
      'pak rice traders dina': { action: 'map', party: 'Pak Rice Traders' },
      'tayyab traders chakwal': { action: 'map', party: 'Tayyab Traders' },
      'hazrat hussain sawat': { action: 'create', name: 'Hazrat Hussain Sawat' },
      'someone else': { action: 'skip' },
    },
    banks: { 'grainco ubl': 'UBL', cash: 'Cash' },
  };

  it('only SUPER_ADMIN may import', async () => {
    await upload(as.ADMIN, await workbook(), true).expect(403);
  });

  it('dry run: plans everything, matches the Excel Dashboard, lists names to map — and writes nothing', async () => {
    const res = await upload(as.SUPER_ADMIN, await workbook(), true).expect(200);
    const r = res.body;
    expect(r).toMatchObject({ dryRun: true, ready: false });
    expect(r.summary).toMatchObject({
      categories: { create: 0, exists: 3 },
      products: { create: 6, exists: 0 },
      parties: { create: 2 },
      cities: { create: 2 },
      salespersons: { create: 1 },
      invoices: { create: 2, exists: 0, lines: 6 },
    });
    expect(r.comparison.every((c: { matches: boolean }) => c.matches)).toBe(true);
    expect(r.mismatches).toEqual([]);
    expect(
      r.unmatchedParties.map((u: { raw: string; suggestion: string | null }) => [
        u.raw,
        u.suggestion,
      ]),
    ).toEqual([
      ['Hazrat Hussain Sawat', null],
      ['Pak Rice Traders dina', 'Pak Rice Traders'],
      ['Someone Else', null],
      ['Tayyab Traders Chakwal', 'Tayyab Traders'],
    ]);
    expect(r.banks.find((b: { raw: string }) => b.raw === 'grainco ubl').suggestion).toBe('UBL');
    expect(await t.prisma.invoice.count()).toBe(0);
    expect(await t.prisma.product.count()).toBe(0);
  });

  it('a real run is refused until every name is decided', async () => {
    const res = await upload(as.SUPER_ADMIN, await workbook(), false).expect(400);
    expect(res.body.message).toMatch(/not ready/);
    expect(await t.prisma.invoice.count()).toBe(0);
  });

  it('a text invoice number is reported, never guessed', async () => {
    const res = await upload(
      as.SUPER_ADMIN,
      await workbook({ badInvoiceNo: true }),
      true,
      MAPPING,
    ).expect(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.problems).toEqual([
      {
        sheet: 'Database',
        row: 8,
        message:
          'Invoice # "1111do" is not a whole number — give this line a proper invoice number in the workbook.',
      },
    ]);
  });

  it('imports with the mapping: clean names, golden #15 exact, payments de-duplicated, audit entry', async () => {
    const res = await upload(as.SUPER_ADMIN, await workbook(), false, MAPPING).expect(200);
    expect(res.body).toMatchObject({
      dryRun: false,
      ready: true,
      created: { invoices: 2, lines: 6, payments: 3 }, // Payments row + Tayyab + Hazrat; Sheet1 copy of 4411 = duplicate; "Someone Else" skipped
    });
    expect(res.body.summary.payments).toMatchObject({
      create: 3,
      duplicate: 1,
      skipped: 1,
      unmapped: 0,
    });

    // Names trimmed and merged case-insensitively (spec §2.1).
    expect(
      (await t.prisma.party.findMany({ orderBy: { name: 'asc' } })).map((p) => p.name),
    ).toEqual(['Hazrat Hussain Sawat', 'Pak Rice Traders', 'Tayyab Traders']);
    expect((await t.prisma.salesperson.findMany()).map((s) => s.name)).toEqual(['Farhan Khalid']);
    const prt = await t.prisma.party.findFirstOrThrow({
      where: { name: 'Pak Rice Traders' },
      include: { city: true },
    });
    expect(prt.city?.name).toBe('Dina'); // default city from its invoices

    // Golden invoice #15 through the importer.
    const inv = await as.SUPER_ADMIN.get('/api/v1/invoices?invoiceNo=15').expect(200);
    expect(inv.body.totals).toMatchObject({
      totalAmount: '1272188',
      totalCommission: '4452.658',
      totalPacks: 200,
    });
    const rice = await t.prisma.invoice.findUniqueOrThrow({
      where: { invoiceNo: 16 },
      include: { lines: true },
    });
    expect(rice.lines[0]).toMatchObject({ qtyPacks: 10 });
    expect(rice.lines[0]!.packWeightKg.toString()).toBe('40');
    expect(rice.totalAmount.toString()).toBe('50000');

    // Payments: bank mapped, original text kept in remarks.
    const tayyabPay = await t.prisma.payment.findFirstOrThrow({
      where: { amount: 20000 },
      include: { bank: true },
    });
    expect(tayyabPay.bank?.name).toBe('UBL');
    expect(tayyabPay.remarks).toBe('from app · Bank: grainco ubl');

    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'IMPORT' } });
    expect(audit.after).toMatchObject({ invoices: 2, lines: 6, payments: 3 });

    // The dashboard now shows the Excel figures.
    const dash = await as.SUPER_ADMIN.get(
      '/api/v1/reports/dashboard?from=2026-09-01&to=2026-09-30',
    ).expect(200);
    expect(dash.body.kpis).toMatchObject({
      revenue: '1322188',
      commission: '4627.658',
      invoices: 2,
      packs: 210,
    });
  });

  it('running it again changes nothing (safe re-run)', async () => {
    const res = await upload(as.SUPER_ADMIN, await workbook(), false, MAPPING).expect(200);
    expect(res.body.created).toEqual({ masters: 0, invoices: 0, lines: 0, payments: 0 });
    expect(res.body.summary.invoices).toMatchObject({ create: 0, exists: 2 });
    expect(res.body.summary.payments).toMatchObject({ create: 0, exists: 3 });
    expect(await t.prisma.payment.count()).toBe(3);
  });

  it('rejects a file that is not a workbook', async () => {
    const res = await upload(as.SUPER_ADMIN, Buffer.from('not excel'), true).expect(400);
    expect(res.body.message).toBe('That file could not be read as an .xlsx workbook.');
  });
});
