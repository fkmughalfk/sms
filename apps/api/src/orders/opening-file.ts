import ExcelJS from 'exceljs';
import { text } from '../import/workbook';

// Reads the old "PENDING ORDERS DETAIL" (as .csv or .xlsx) for the opening import.
// Columns are found by their header, so the order of columns doesn't matter.

export interface OpeningRow {
  row: number;
  city: string;
  date: string | null;
  party: string;
  orderNo: number | null;
  salesperson: string;
  product: string;
  kg: string;
  cropYear: string;
  qty: number | null;
  wt: string;
  rate: string;
  /** The rate is per this many kg: 40 (rice, pulses) or 25 (the ghee report's "RATE 25 KG"). */
  rateBasisKg: number;
  dispatched: number;
  wtRemaining: string;
  amount: string;
}

/** Header text → field. Matched lower-case with everything but letters and digits removed. */
const HEADERS: Record<string, keyof OpeningRow | 'rateBasis' | 'rate25'> = {
  city: 'city',
  date: 'date',
  party: 'party',
  partyname: 'party',
  orderno: 'orderNo',
  order: 'orderNo',
  salesperson: 'salesperson',
  salesman: 'salesperson',
  product: 'product',
  productpurezafarani: 'product',
  kg: 'kg',
  cropyear: 'cropYear',
  crop: 'cropYear',
  qty: 'qty',
  qtyouter: 'qty',
  wt: 'wt',
  weight: 'wt',
  rate: 'rate',
  rate25kg: 'rate25',
  dispatched: 'dispatched',
  totaldispat: 'dispatched',
  totaldispatched: 'dispatched',
  wtremaining: 'wtRemaining',
  wtre: 'wtRemaining',
  amount: 'amount',
  ratebasis: 'rateBasis',
};

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "3-Nov-26", "2026-11-03", "03/11/2026" → `YYYY-MM-DD`. */
export function parseReportDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS.indexOf(m[2]!.toLowerCase());
    if (month === -1) return null;
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${year}-${pad(month + 1)}-${pad(Number(m[1]))}`;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return null;
}

const int = (s: string) => {
  const t = s.replace(/,/g, '').trim();
  return /^\d+$/.test(t) ? Number(t) : null;
};
const decimal = (s: string) => s.replace(/,/g, '').trim();

function csvRows(content: string): string[][] {
  const rows: string[][] = [];
  for (const line of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}

async function xlsxRows(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value;
      cells.push(v instanceof Date ? v.toISOString().slice(0, 10) : text(v));
    }
    rows.push(cells);
  });
  return rows;
}

export interface ParsedOpeningFile {
  rows: OpeningRow[];
  problems: { row: number; message: string }[];
}

export async function parseOpeningFile(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedOpeningFile> {
  let table: string[][];
  try {
    table = /\.csv$/i.test(fileName) ? csvRows(buffer.toString('utf8')) : await xlsxRows(buffer);
  } catch {
    return {
      rows: [],
      problems: [{ row: 0, message: 'This is not a readable .xlsx or .csv file.' }],
    };
  }
  const headerAt = table.findIndex((r) =>
    r.some((c) => key(c) === 'party' || key(c) === 'partyname'),
  );
  if (headerAt === -1) {
    return {
      rows: [],
      problems: [
        { row: 0, message: 'No header row with PARTY / PRODUCT / QTY columns was found.' },
      ],
    };
  }
  const cols = new Map<string, number>();
  table[headerAt]!.forEach((h, i) => {
    const field = HEADERS[key(h)];
    if (field && !cols.has(field)) cols.set(field, i);
  });
  const missing = ['party', 'product', 'kg', 'qty', 'date'].filter((f) => !cols.has(f));
  if (!cols.has('rate') && !cols.has('rate25')) missing.push('rate');
  if (missing.length) {
    return {
      rows: [],
      problems: [{ row: headerAt + 1, message: `Missing column(s): ${missing.join(', ')}.` }],
    };
  }

  const rows: OpeningRow[] = [];
  const problems: ParsedOpeningFile['problems'] = [];
  let city = '';
  for (let i = headerAt + 1; i < table.length; i++) {
    const r = table[i]!;
    const n = i + 1;
    const get = (f: string) => {
      const c = cols.get(f);
      return c === undefined ? '' : (r[c] ?? '').trim();
    };
    const party = get('party');
    const product = get('product');
    // A city heading on its own row (the printed report) sets the city for the rows below.
    if (!party && !product) {
      const first = r.find((c) => c.trim())?.trim() ?? '';
      if (first && !/pending/i.test(first) && /^[A-Za-z][A-Za-z .'-]*$/.test(first)) city = first;
      continue;
    }
    const rateBasis = get('rateBasis');
    const rateBasisKg = cols.has('rate25') || /25/.test(rateBasis) ? 25 : 40;
    const row: OpeningRow = {
      row: n,
      city: get('city') || city,
      date: parseReportDate(get('date')),
      party,
      orderNo: int(get('orderNo')),
      salesperson: get('salesperson'),
      product,
      kg: decimal(get('kg')),
      cropYear: get('cropYear'),
      qty: int(get('qty')),
      wt: decimal(get('wt')),
      rate: decimal(get('rate') || get('rate25')),
      rateBasisKg,
      dispatched: int(get('dispatched')) ?? 0,
      wtRemaining: decimal(get('wtRemaining')),
      amount: decimal(get('amount')),
    };
    if (!row.date) problems.push({ row: n, message: `Unreadable date "${get('date')}".` });
    else if (!row.qty) problems.push({ row: n, message: 'Enter the quantity (QTY).' });
    else if (!/^\d+(\.\d+)?$/.test(row.kg))
      problems.push({ row: n, message: 'Enter the pack size (KG).' });
    else if (!/^\d+(\.\d+)?$/.test(row.rate)) problems.push({ row: n, message: 'Enter the rate.' });
    else if (row.dispatched > row.qty) {
      problems.push({ row: n, message: 'More dispatched than ordered.' });
    } else rows.push(row);
  }
  return { rows, problems };
}
