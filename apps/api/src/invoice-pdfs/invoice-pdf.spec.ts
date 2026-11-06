import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { orderNoIn, parseInvoice, type TextItem } from './invoice-pdf';

// Text read from the owner's sample invoice PDFs (contact numbers removed).
const load = (name: string) =>
  JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', 'test', 'fixtures', 'invoice-pdf', `${name}.json`),
      'utf8',
    ),
  ) as TextItem[];

describe('parseInvoice', () => {
  it('reads the header fields and a one-line rice invoice', () => {
    const inv = parseInvoice(load('ashfaq'));
    expect(inv).toMatchObject({
      invoiceNo: 706,
      invoiceDate: '2026-11-03',
      party: 'ALPHA COMMISSION SHOP - RAWALPINIDI',
      subParty: 'SUPPLY FROM U-2 OLD',
      city: 'RAWALPINDI',
      doNo: '727',
      vehicleNo: 'ABC---1111',
      dcNo: '725',
      ogpNo: '14515',
      bookingNo: '0',
      orderNo: null,
      totals: { qty: '100', weight: '2500', amount: '843750', netPayable: '843750' },
      problems: [],
    });
    expect(inv.lines).toEqual([
      {
        srNo: 1,
        description: 'PURE ZAFARANI - 1121 STEAM - 25 KG',
        cropYear: '2025-2026',
        qty: '100',
        rate40Kg: '13500',
        bagRate: '8437.50',
        weight: '2500',
        amount: '843750',
      },
    ]);
  });

  it('follows the lines onto page 2 and ignores the repeated totals', () => {
    const inv = parseInvoice(load('haji'));
    expect(inv.problems).toEqual([]);
    expect(inv.lines.map((l) => [l.srNo, l.description, l.qty, l.rate40Kg, l.amount])).toEqual([
      [1, 'ZAFARANI-WHITE CHANA 7-8 MM - 25 KG', '5', '10600', '33125'],
      [2, 'ZAFARANI-DAAL CHANA REGULAR - 25 KG', '5', '9800', '30625'],
      [3, 'ZAFARANI-DAAL MOONG - 25- KG', '2', '10250', '12812'],
      [4, 'ZAFARANI- MASAR SABAT - 25 KG', '2', '7850', '9812'],
      [5, 'ZAFARANI-DAAL MASH CHARRI - 25 KG', '2', '17900', '22375'],
      [6, 'ZAFARANI-RED LOBIA - 25 KG', '2', '14800', '18500'],
      [7, 'ZAFARANI-BLACK CHANA JUMBO - 25 KG', '2', '10500', '13125'],
      [8, 'ZAFARANI-DAAL MASOOR - 25 KG', '2', '8250', '10312'],
      [9, 'ZAFARANI-DAAL CHANA SUPREME - 25 KG', '10', '11300', '70625'],
    ]);
    expect(inv.totals).toEqual({
      qty: '32',
      weight: '800',
      amount: '221311',
      netPayable: '221311',
    });
  });

  it('spices: the bag rate is the pack price; seven lines over two pages', () => {
    const inv = parseInvoice(load('shalimar1'));
    expect(inv.problems).toEqual([]);
    expect(inv.lines.map((l) => [l.description, l.qty, l.bagRate, l.amount])).toEqual([
      ['PURE ZAFARANI BARI ELAICHI - 3 KG', '20', '8650.00', '173000'],
      ['PURE ZAFARANI SABAT MIX MASALA - 5.5 KG', '20', '6600.00', '132000'],
      ['PURE ZAFARANI LOONG - 3.5 KG', '10', '10850.00', '108500'],
      ['PURE ZAFARANI BADYAN KHATAYE - 2.5 KG', '20', '2945.00', '58900'],
      ['PURE ZAFARANI KALI MIRCH - 5 KG', '30', '11340.00', '340200'],
      ['PURE ZAFARANI ZEERA - 5.5 KG', '100', '6050.00', '605000'],
      ['PURE ZAFARANI TEZ PATTA - 1.5 KG', '50', '680.00', '34000'],
    ]);
  });

  it("ghee in cartons, and the party's own vehicle", () => {
    const inv = parseInvoice(load('shalimar2'));
    expect(inv).toMatchObject({ invoiceNo: 705, vehicleNo: 'DELTA TRD', problems: [] });
    expect(inv.lines[0]).toMatchObject({
      description: 'ZAFARANI DASI GHEE 500 GM - 0.5 KG X 12= 6 KG PER CARTON',
      qty: '5',
      rate40Kg: '116000',
      bagRate: '17400.00',
      weight: '30',
      amount: '87000',
    });
  });

  it('joins a party name that wraps onto a second line', () => {
    expect(parseInvoice(load('tahir')).party).toBe('ECHO SHA TRADERS MAIN ROAD -RAWALPINDI');
  });

  it('finds an order number written into the Sub Party field', () => {
    const inv = parseInvoice(load('inayat'));
    expect([inv.subParty, inv.orderNo, inv.lines[0]?.cropYear]).toEqual([
      'SUPPLY FROM U-2 O.N 3159',
      3159,
      '2026/2027',
    ]);
  });

  it('a missing page is caught by the totals', () => {
    const inv = parseInvoice(load('haji').filter((i) => i.p === 1));
    expect(inv.problems).toEqual([
      "The line amounts don't add up to the invoice total (221311); a page may be missing.",
      "The quantities don't add up to the invoice total (32).",
    ]);
  });

  it('refuses anything that is not a sales invoice', () => {
    expect(parseInvoice([{ p: 1, x: 10, y: 10, w: 50, s: 'Hello' }]).problems).toEqual([
      'This is not a Waqar Rice Mills sales invoice.',
    ]);
  });
});

describe('orderNoIn', () => {
  it.each([
    ['SUPPLY FROM U-2 O.N 3159', 3159],
    ['SUPPLY FROM U-2 ON 3200', 3200],
    ['O.N. NO 3211', 3211],
    ['SUPPLY FROM U-2', null],
    ['SUPPLY FROM U-2 OLD', null],
  ])('%s → %s', (text, no) => expect(orderNoIn(text)).toBe(no));
});
