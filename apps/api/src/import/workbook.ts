import ExcelJS from 'exceljs';

// Reads the source workbook (spec §11) into plain rows. Columns are found by their
// header text, so a moved column doesn't break the import. Formula cells give their
// cached result. Nothing here touches the database.

export interface RawProduct {
  row: number;
  sku: number | null;
  name: string;
  unitWeightKg: number | null;
  packPcs: number | null;
  category: string;
}

export interface RawLine {
  row: number;
  invoiceNo: number | null;
  /** The Invoice # cell as written, for messages. */
  invoiceNoText: string;
  invoiceDate: string | null;
  party: string;
  subParty: string;
  city: string;
  salesperson: string;
  product: string;
  qtyPacks: number | null;
  rate40Kg: number | null;
  /** Excel's calculated cells, for the mismatch report. */
  excelAmount: number | null;
  excelCommission: number | null;
}

export interface RawPayment {
  sheet: 'Payments' | 'Sheet1';
  row: number;
  date: string | null;
  party: string;
  subParty: string;
  slipNo: string;
  bank: string;
  amount: number | null;
  remarks: string;
}

export interface ExcelBreakdownRow {
  name: string;
  amount: number | null;
}

export interface ParsedWorkbook {
  defaultCommissionRate: number | null;
  categoryRates: { name: string; rate: number | null }[];
  products: RawProduct[];
  lists: {
    parties: string[];
    cities: string[];
    salespersons: string[];
    subParties: string[];
    banks: string[];
  };
  lines: RawLine[];
  payments: RawPayment[];
  dashboard: {
    revenue: number | null;
    commission: number | null;
    tons: number | null;
    invoices: number | null;
    byCategory: ExcelBreakdownRow[];
    bySalesperson: ExcelBreakdownRow[];
  };
  /** Sheets the import expected but didn't find. */
  missingSheets: string[];
}

type CellValue = ExcelJS.CellValue;

/** Plain value of a cell: formula → cached result, rich text → text. */
function plain(v: CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v || 'formula' in v || 'sharedFormula' in v) {
      return plain((v as { result?: CellValue }).result ?? null);
    }
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return (v as { text: string }).text;
    if ('error' in v) return null;
  }
  return v;
}

export const text = (v: CellValue): string => {
  const p = plain(v);
  if (p === null) return '';
  if (p instanceof Date) return p.toISOString().slice(0, 10);
  return String(p).trim();
};

export const num = (v: CellValue): number | null => {
  const p = plain(v);
  if (typeof p === 'number' && Number.isFinite(p)) return p;
  if (typeof p === 'string' && /^-?\d+(\.\d+)?$/.test(p.trim().replace(/,/g, ''))) {
    return Number(p.trim().replace(/,/g, ''));
  }
  return null;
};

/** `YYYY-MM-DD` from a date cell, an Excel serial, or text like 2026-09-01 / 01/09/2026. */
export const date = (v: CellValue): string | null => {
  const p = plain(v);
  if (p instanceof Date) return p.toISOString().slice(0, 10);
  if (typeof p === 'number' && p > 30000 && p < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + p * 86_400_000).toISOString().slice(0, 10);
  }
  if (typeof p === 'string') {
    const s = p.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // day-first (Pakistan)
    if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  return null;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Column numbers for the given headers found in `headerRow`. */
function columns(ws: ExcelJS.Worksheet, headerRow: number, wanted: Record<string, string[]>) {
  const found: Record<string, number> = {};
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    const h = norm(text(cell.value));
    for (const [key, aliases] of Object.entries(wanted)) {
      if (found[key] === undefined && aliases.some((a) => h === norm(a))) found[key] = col;
    }
  });
  return found;
}

/** First row (1–30) whose cells include all of `headers`. */
function findHeaderRow(ws: ExcelJS.Worksheet, headers: string[]): number | null {
  for (let r = 1; r <= 30; r++) {
    const cells = new Set<string>();
    ws.getRow(r).eachCell({ includeEmpty: false }, (c) => {
      cells.add(norm(text(c.value)));
    });
    if (headers.every((h) => cells.has(norm(h)))) return r;
  }
  return null;
}

function listColumn(ws: ExcelJS.Worksheet, col: number, fromRow: number): string[] {
  const out: string[] = [];
  for (let r = fromRow; r <= ws.rowCount; r++) {
    const v = text(ws.getRow(r).getCell(col).value);
    if (v) out.push(v);
  }
  return out;
}

export async function parseWorkbook(buffer: Buffer | ArrayBuffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const missingSheets: string[] = [];
  const sheet = (name: string) => {
    const ws = wb.worksheets.find((w) => norm(w.name) === norm(name));
    if (!ws) missingSheets.push(name);
    return ws;
  };

  // ── Products (rows 4+) + category rate table (J:K) and default rate (G3) ──
  const products: RawProduct[] = [];
  let defaultCommissionRate: number | null = null;
  const categoryRates: { name: string; rate: number | null }[] = [];
  const ps = sheet('Products');
  if (ps) {
    const h = findHeaderRow(ps, ['Product', 'Category']) ?? 3;
    const c = columns(ps, h, {
      sku: ['#'],
      name: ['Product'],
      unit: ['Unit Weight (KG)', 'Unit Weight'],
      pcs: ['Pack (pcs)', 'Pack'],
      category: ['Category'],
    });
    defaultCommissionRate = num(ps.getCell('G3').value);
    for (let r = h + 1; r <= ps.rowCount; r++) {
      const row = ps.getRow(r);
      const name = text(row.getCell(c.name ?? 2).value);
      if (!name) continue;
      products.push({
        row: r,
        sku: num(row.getCell(c.sku ?? 1).value),
        name,
        unitWeightKg: num(row.getCell(c.unit ?? 3).value),
        packPcs: num(row.getCell(c.pcs ?? 4).value),
        category: text(row.getCell(c.category ?? 8).value),
      });
    }
    // The second "Category" header (J) heads the category → rate table.
    for (let r = h + 1; r <= h + 10; r++) {
      const name = text(ps.getRow(r).getCell(10).value);
      if (!name) break;
      categoryRates.push({ name, rate: num(ps.getRow(r).getCell(11).value) });
    }
  }

  // ── Lists ──
  const lists = {
    parties: [] as string[],
    cities: [] as string[],
    salespersons: [] as string[],
    subParties: [] as string[],
    banks: [] as string[],
  };
  const ls = sheet('Lists');
  if (ls) {
    const c = columns(ls, 1, {
      parties: ['Party (Name)', 'Party'],
      cities: ['City'],
      salespersons: ['ASM / Salesperson', 'ASM'],
      subParties: ['Sub Party'],
      banks: ['Bank'],
    });
    for (const key of Object.keys(lists) as (keyof typeof lists)[]) {
      if (c[key]) lists[key] = listColumn(ls, c[key], 2);
    }
  }

  // ── Database (tblLines) ──
  const lines: RawLine[] = [];
  const db = sheet('Database');
  if (db) {
    const h = findHeaderRow(db, ['Invoice #', 'Description (Product)']) ?? 1;
    const c = columns(db, h, {
      invoiceNo: ['Invoice #', 'Invoice No.'],
      invoiceDate: ['Invoice Date'],
      party: ['Party (Name)'],
      subParty: ['Sub Party'],
      city: ['City'],
      salesperson: ['ASM / Salesperson'],
      product: ['Description (Product)'],
      qty: ['Qty (Packs)', 'Bags'],
      rate: ['Rate 40Kg'],
      amount: ['Amount'],
      commission: ['Commission'],
    });
    for (let r = h + 1; r <= db.rowCount; r++) {
      const row = db.getRow(r);
      const get = (k: string) => (c[k] ? row.getCell(c[k]).value : null);
      const product = text(get('product'));
      const invoiceNo = num(get('invoiceNo'));
      if (!product && invoiceNo === null) continue;
      lines.push({
        row: r,
        invoiceNo,
        invoiceNoText: text(get('invoiceNo')),
        invoiceDate: date(get('invoiceDate')),
        party: text(get('party')),
        subParty: text(get('subParty')),
        city: text(get('city')),
        salesperson: text(get('salesperson')),
        product,
        qtyPacks: num(get('qty')),
        rate40Kg: num(get('rate')),
        excelAmount: num(get('amount')),
        excelCommission: num(get('commission')),
      });
    }
  }

  // ── Payments (tblPayments, headers on the "PAYMENT ENTRIES" row) ──
  const payments: RawPayment[] = [];
  const pay = sheet('Payments');
  if (pay) {
    const h = findHeaderRow(pay, ['Date', 'Party (Name)', 'Slip No.', 'Amount']);
    if (h) {
      const c = columns(pay, h, {
        date: ['Date'],
        party: ['Party (Name)'],
        subParty: ['Sub Party'],
        slip: ['Slip No.'],
        bank: ['Bank'],
        amount: ['Amount'],
        remarks: ['Remarks'],
      });
      for (let r = h + 1; r <= pay.rowCount; r++) {
        const row = pay.getRow(r);
        const get = (k: string) => (c[k] ? row.getCell(c[k]).value : null);
        const amount = num(get('amount'));
        const party = text(get('party'));
        if (!party && amount === null) continue;
        payments.push({
          sheet: 'Payments',
          row: r,
          date: date(get('date')),
          party,
          subParty: text(get('subParty')),
          slipNo: text(get('slip')),
          bank: text(get('bank')),
          amount,
          remarks: text(get('remarks')),
        });
      }
    }
  }

  // ── Sheet1 (raw bank log) ──
  const s1 = sheet('Sheet1');
  if (s1) {
    const h = findHeaderRow(s1, ['Date', 'Party Name', 'Amount']);
    if (h) {
      const c = columns(s1, h, {
        date: ['Date'],
        party: ['Party Name'],
        bank: ['Bank'],
        slip: ['Tansaction/slip no', 'Transaction/slip no', 'Slip No.'],
        amount: ['Amount'],
        remarks: ['Discription', 'Description', 'Remarks'],
      });
      for (let r = h + 1; r <= s1.rowCount; r++) {
        const row = s1.getRow(r);
        const get = (k: string) => (c[k] ? row.getCell(c[k]).value : null);
        const amount = num(get('amount'));
        const party = text(get('party'));
        if (!party && amount === null) continue;
        payments.push({
          sheet: 'Sheet1',
          row: r,
          date: date(get('date')),
          party,
          subParty: '',
          slipNo: text(get('slip')),
          bank: text(get('bank')),
          amount,
          remarks: text(get('remarks')),
        });
      }
    }
  }

  // ── Dashboard figures to compare against ──
  const dashboard: ParsedWorkbook['dashboard'] = {
    revenue: null,
    commission: null,
    tons: null,
    invoices: null,
    byCategory: [],
    bySalesperson: [],
  };
  const ds = sheet('Dashboard');
  if (ds) {
    dashboard.revenue = num(ds.getCell('B7').value);
    dashboard.commission = num(ds.getCell('E7').value);
    dashboard.tons = num(ds.getCell('H7').value);
    dashboard.invoices = num(ds.getCell('K7').value);
    const block = (title: string) => {
      const rows: ExcelBreakdownRow[] = [];
      let r = 1;
      while (
        r <= Math.min(ds.rowCount, 300) &&
        !norm(text(ds.getCell(`B${r}`).value)).startsWith(norm(title))
      )
        r++;
      for (r += 2; r <= ds.rowCount; r++) {
        const name = text(ds.getCell(`B${r}`).value);
        if (!name || norm(name) === 'total') break;
        rows.push({ name, amount: num(ds.getCell(`H${r}`).value) });
      }
      return rows;
    };
    dashboard.byCategory = block('SALES BY CATEGORY');
    dashboard.bySalesperson = block('SALES BY ASM');
  }

  return {
    defaultCommissionRate,
    categoryRates,
    products,
    lists,
    lines,
    payments,
    dashboard,
    missingSheets,
  };
}
