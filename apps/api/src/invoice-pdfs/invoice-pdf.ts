// Reads the current software's "SALES INVOICE" PDF (layout: docs/invoice-format.md).
// The PDF holds real text, so it is read exactly: each piece of text with its position,
// then fields by their labels and line items by the table's columns.

import { pathToFileURL } from 'node:url';

export interface TextItem {
  /** Page, 1-based. */
  p: number;
  x: number;
  y: number;
  /** Width of the text run. */
  w: number;
  s: string;
}

export interface ParsedLine {
  srNo: number;
  description: string;
  cropYear: string;
  qty: string;
  rate40Kg: string;
  bagRate: string;
  weight: string;
  amount: string;
}

export interface ParsedInvoice {
  invoiceNo: number | null;
  /** `YYYY-MM-DD`. */
  invoiceDate: string | null;
  party: string;
  subParty: string;
  city: string;
  doNo: string;
  vehicleNo: string;
  dcNo: string;
  ogpNo: string;
  bookingNo: string;
  /** An order number written into the invoice ("… O.N 3159"), if any. */
  orderNo: number | null;
  lines: ParsedLine[];
  totals: { qty: string; weight: string; amount: string; netPayable: string };
  /** Reasons the PDF can't be trusted as read. */
  problems: string[];
}

// The comment makes the source unique per module load. V8 reuses a compiled function with the
// same source, along with the module loader it was first made in; under Jest that can be an
// earlier test file's, already torn down ("import a file after the environment...").
const importEsm = new Function(
  'specifier',
  `return import(specifier); // ${Date.now()}-${Math.random()}`,
) as (specifier: string) => Promise<unknown>;

/**
 * The resolved path is what's imported. Also, writing `require.resolve` here lets the Vercel
 * bundler (file tracing) see pdfjs and ship it; it can't see through `importEsm`.
 */
const PDFJS = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');

/** Text runs of every page, with positions (pdfjs; works without a browser). */
export async function extractTextItems(buffer: Buffer): Promise<TextItem[]> {
  // pdfjs is an ES module; this real import() survives compilers (e.g. ts-jest) that would
  // otherwise turn it into require().
  const pdfjs = (await importEsm(
    pathToFileURL(PDFJS).href,
  )) as typeof import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const items: TextItem[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      items.push({ p: n, x: it.transform[4], y: it.transform[5], w: it.width, s: it.str.trim() });
    }
  }
  await doc.destroy();
  return items;
}

const NUM_RE = /^-?[\d,]+(\.\d+)?$/;
const number = (s: string) => s.replace(/,/g, '');
const cx = (i: TextItem) => i.x + i.w / 2;

const LEFT_LABELS = ['Name:', 'Sub Party', 'Address:', 'City:', 'Contact:', 'G.S.T NUMBER'];
const RIGHT_LABELS = [
  'Invoice No.',
  'Invoice Date',
  'D.o.No.:',
  'Vehicle No:',
  'DC No :',
  'Ntn/Cnic:',
  'OGP No.',
  'Booking No.',
];
const LABELS = new Set([...LEFT_LABELS, ...RIGHT_LABELS]);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** "03/11/2026" → "2026-11-03". */
function dmy(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "SUPPLY FROM U-2 O.N 3159" → 3159. */
export function orderNoIn(text: string): number | null {
  const m = /\bO\s*\.?\s*N\s*\.?\s*(?:NO\.?)?\s*[:#-]?\s*(\d{2,9})\b/i.exec(text);
  return m ? Number(m[1]) : null;
}

export function parseInvoice(items: TextItem[]): ParsedInvoice {
  const problems: string[] = [];
  const page1 = items.filter((i) => i.p === 1);
  const label = (text: string) => page1.find((i) => norm(i.s) === text);

  /** The value printed to the right of a label, on the same line. */
  const valueOf = (text: string): { item: TextItem | null; value: string } => {
    const l = label(text);
    if (!l) return { item: null, value: '' };
    const maxX = LEFT_LABELS.includes(text) ? 440 : 640;
    const candidates = page1
      .filter(
        (i) =>
          i !== l &&
          !LABELS.has(norm(i.s)) &&
          Math.abs(i.y - l.y) <= 4.5 &&
          i.x > l.x + l.w - 1 &&
          i.x < maxX,
      )
      .sort((a, b) => a.x - b.x);
    const item = candidates[0] ?? null;
    return { item, value: item ? norm(item.s) : '' };
  };

  if (!page1.some((i) => /SALES INVOICE/i.test(i.s)) || !label('Invoice No.')) {
    return {
      invoiceNo: null,
      invoiceDate: null,
      party: '',
      subParty: '',
      city: '',
      doNo: '',
      vehicleNo: '',
      dcNo: '',
      ogpNo: '',
      bookingNo: '',
      orderNo: null,
      lines: [],
      totals: { qty: '', weight: '', amount: '', netPayable: '' },
      problems: ['This is not a Waqar Rice Mills sales invoice.'],
    };
  }

  // Party name; a long name wraps onto the next line (e.g. "…RAWALPIND" + "I").
  const name = valueOf('Name:');
  const sub = valueOf('Sub Party');
  let party = name.value;
  if (name.item) {
    const floor = sub.item ? sub.item.y + 3 : name.item.y - 14;
    const wrapped = page1
      .filter(
        (i) =>
          i !== name.item &&
          Math.abs(i.x - name.item!.x) <= 3 &&
          i.y < name.item!.y - 3 &&
          i.y > floor &&
          !LABELS.has(norm(i.s)),
      )
      .sort((a, b) => b.y - a.y);
    for (const w of wrapped) party = w.s.length <= 2 ? party + w.s : `${party} ${w.s}`;
  }

  const invoiceNoText = valueOf('Invoice No.').value;
  const invoiceNo = /^\d+$/.test(invoiceNoText) ? Number(invoiceNoText) : null;
  if (invoiceNo === null) problems.push('The invoice number could not be read.');
  const dateText = valueOf('Invoice Date').value;
  const invoiceDate = dmy(dateText);
  if (!invoiceDate) problems.push(`The invoice date "${dateText}" could not be read.`);
  const subParty = sub.value;

  // ── Line items ──
  const header = page1.find((i) => norm(i.s) === 'Sr. No.');
  const head = (text: string, near?: TextItem) =>
    page1
      .filter((i) => norm(i.s) === text && (!header || Math.abs(i.y - header.y) <= 12))
      .sort((a, b) => (near ? Math.abs(a.x - near.x) - Math.abs(b.x - near.x) : a.x - b.x))[0];
  const crop = head('CropYear');
  const qty = head('Qty');
  const rate = head('40Kg');
  const bag = head('Bag');
  const weight = head('Weight');
  const amount = head('AMOUNT');
  if (!header || !crop || !qty || !rate || !bag || !weight || !amount) {
    problems.push('The table of products could not be found.');
    return {
      invoiceNo,
      invoiceDate,
      party,
      subParty,
      city: valueOf('City:').value,
      doNo: valueOf('D.o.No.:').value,
      vehicleNo: valueOf('Vehicle No:').value,
      dcNo: valueOf('DC No :').value,
      ogpNo: valueOf('OGP No.').value,
      bookingNo: valueOf('Booking No.').value,
      orderNo: orderNoIn(subParty),
      lines: [],
      totals: { qty: '', weight: '', amount: '', netPayable: '' },
      problems,
    };
  }
  const columns: [keyof ParsedLine, number][] = [
    ['qty', cx(qty)],
    ['rate40Kg', cx(rate)],
    ['bagRate', cx(bag)],
    ['weight', cx(weight)],
    ['amount', cx(amount)],
  ];
  const columnOf = (i: TextItem) =>
    columns.reduce((best, c) => (Math.abs(cx(i) - c[1]) < Math.abs(cx(i) - best[1]) ? c : best))[0];

  const pages = [...new Set(items.map((i) => i.p))].sort((a, b) => a - b);
  const lines = new Map<number, ParsedLine>();
  let totalRow: TextItem[] = [];
  let netPayable = '';
  for (const p of pages) {
    const onPage = items.filter((i) => i.p === p);
    const total = onPage.find((i) => norm(i.s) === 'Total');
    const top = p === 1 ? header.y - 4 : Infinity;
    const bottom = total ? total.y + 6 : -Infinity;
    const inTable = onPage.filter((i) => i.y < top && i.y > bottom);
    const srs = inTable
      .filter((i) => i.x < header.x + header.w && /^\d+$/.test(i.s))
      .sort((a, b) => b.y - a.y);
    srs.forEach((sr, k) => {
      const next = srs[k + 1];
      const band = inTable.filter((i) => Math.abs(i.y - sr.y) <= 4.5);
      const desc = inTable
        .filter(
          (i) =>
            i.x > sr.x + sr.w &&
            i.x < crop.x - 4 &&
            i.y <= sr.y + 4.5 &&
            i.y > (next ? next.y + 4.5 : bottom),
        )
        .sort((a, b) => b.y - a.y)
        .map((i) => i.s);
      const line: ParsedLine = {
        srNo: Number(sr.s),
        description: norm(desc.join(' ')),
        cropYear: band.find((i) => Math.abs(i.x - crop.x) <= 25)?.s ?? '',
        qty: '',
        rate40Kg: '',
        bagRate: '',
        weight: '',
        amount: '',
      };
      for (const i of band) {
        if (i.x <= crop.x + crop.w + 4 || !NUM_RE.test(i.s)) continue;
        const col = columnOf(i);
        if (!line[col]) (line as unknown as Record<string, string>)[col] = number(i.s);
      }
      if (!lines.has(line.srNo)) lines.set(line.srNo, line);
    });
    if (total && !totalRow.length) {
      totalRow = onPage.filter((i) => Math.abs(i.y - total.y) <= 4.5 && i.x > total.x);
    }
    if (!netPayable) {
      const np = onPage.find((i) => norm(i.s) === 'Net payable');
      const v = np
        ? onPage.find(
            (i) => i !== np && Math.abs(i.y - np.y) <= 4.5 && i.x > np.x && NUM_RE.test(i.s),
          )
        : undefined;
      if (v) netPayable = number(v.s);
    }
  }

  const totals = { qty: '', weight: '', amount: '', netPayable };
  for (const i of totalRow) {
    if (!NUM_RE.test(i.s)) continue;
    const col = columnOf(i);
    if (col === 'qty' || col === 'weight' || col === 'amount') totals[col] = number(i.s);
  }

  const sorted = [...lines.values()].sort((a, b) => a.srNo - b.srNo);
  if (!sorted.length) problems.push('No product lines were found.');
  sorted.forEach((l, i) => {
    if (l.srNo !== i + 1) problems.push(`Line ${i + 1} is missing.`);
    if (!l.description || !l.qty || !l.amount || !(l.rate40Kg || l.bagRate)) {
      problems.push(`Line ${l.srNo} could not be read completely.`);
    }
  });
  const add = (xs: string[]) => xs.reduce((n, x) => n + Math.round(Number(x || 0) * 1000), 0);
  if (totals.amount && add(sorted.map((l) => l.amount)) !== add([totals.amount])) {
    problems.push(
      `The line amounts don't add up to the invoice total (${totals.amount}); a page may be missing.`,
    );
  }
  if (totals.qty && add(sorted.map((l) => l.qty)) !== add([totals.qty])) {
    problems.push(`The quantities don't add up to the invoice total (${totals.qty}).`);
  }

  return {
    invoiceNo,
    invoiceDate,
    party: norm(party),
    subParty,
    city: valueOf('City:').value,
    doNo: valueOf('D.o.No.:').value,
    vehicleNo: valueOf('Vehicle No:').value,
    dcNo: valueOf('DC No :').value,
    ogpNo: valueOf('OGP No.').value,
    bookingNo: valueOf('Booking No.').value,
    orderNo: orderNoIn(subParty),
    lines: sorted,
    totals,
    problems,
  };
}
