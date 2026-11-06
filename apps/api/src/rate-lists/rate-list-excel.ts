import {
  defaultRateBasis,
  type RateBasis,
  type RateListLine,
  type RateListProduct,
  type RateListUploadResult,
  rateListItemInputSchema,
} from '@sms/shared';
import ExcelJS from 'exceljs';
import { text } from '../import/workbook';
import { type LineValues, toLine } from './rate-lists.service';

// Rate list as an .xlsx: the office downloads the template (every product, current rates),
// edits the Rate / Available / Note columns, and uploads it back for review before saving.

const COLUMNS = [
  { header: 'Product #', key: 'sku', width: 11 },
  { header: 'Product', key: 'product', width: 38 },
  { header: 'Category', key: 'category', width: 12 },
  { header: 'Pack (kg)', key: 'pack', width: 10 },
  { header: 'Crop Year', key: 'cropYear', width: 12 },
  { header: 'Basis', key: 'basis', width: 12 },
  { header: 'Rate', key: 'rate', width: 12 },
  { header: 'Available', key: 'available', width: 11 },
  { header: 'Note', key: 'note', width: 30 },
] as const;

const BASIS_TEXT: Record<RateBasis, string> = { PER_40KG: 'Per 40 kg', PER_UNIT: 'Per pack' };

export async function buildRateListTemplate(lines: RateListLine[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sales Management System';
  const ws = wb.addWorksheet('Rate list', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ ...c }));
  ws.getRow(1).font = { bold: true };
  for (const l of lines) {
    ws.addRow({
      sku: l.product.sku,
      product: l.product.name,
      category: l.product.category,
      pack: Number(l.product.packWeightKg),
      cropYear: l.cropYear ?? '',
      basis: BASIS_TEXT[l.basis],
      rate: l.rate === null ? 'N/A' : Number(l.rate),
      available: l.isAvailable ? 'Yes' : 'No',
      note: l.note ?? '',
    });
  }
  ws.getColumn('rate').numFmt = '#,##0.##';
  ws.addRow([]);
  ws.addRow([
    'Edit Rate, Available, Crop Year and Note. Basis: "Per 40 kg" (rice, pulses) or "Per pack" (ghee tin, spice pack). Rate "N/A" or Available "No" = not on sale. Add a row per extra crop year.',
  ]).font = { italic: true, color: { argb: 'FF666666' } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function parseBasis(s: string, fallback: RateBasis): RateBasis | undefined {
  const t = s.toLowerCase().replace(/[\s_]/g, '');
  if (t === '') return fallback;
  if (['per40kg', '40kg', '40', 'per40'].includes(t)) return 'PER_40KG';
  if (['perpack', 'pack', 'perunit', 'unit', 'pertin', 'tin'].includes(t)) return 'PER_UNIT';
  return undefined;
}

function parseAvailable(s: string): boolean | null | undefined {
  const t = s.toLowerCase();
  if (t === '') return null;
  if (['yes', 'y', 'true', '1'].includes(t)) return true;
  if (['no', 'n', 'false', '0', 'n/a', 'na'].includes(t)) return false;
  return undefined;
}

/**
 * Reads an uploaded rate list. Products are matched by Product #, else by name. Each row
 * is checked with the same schema as the save; problems are reported per row and the
 * row is left out, so the office can fix the file or the lines on screen.
 */
export async function parseRateListWorkbook(
  buffer: Buffer,
  products: (RateListProduct & { isActive: boolean })[],
  previousRates: Map<string, string | null>,
): Promise<RateListUploadResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { items: [], problems: [{ row: 0, message: 'This is not a readable .xlsx file.' }] };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { items: [], problems: [{ row: 0, message: 'The workbook has no sheets.' }] };

  // Columns by header text, so re-ordered or extra columns still work.
  const col = new Map<string, number>();
  ws.getRow(1).eachCell((cell, n) => col.set(text(cell.value).toLowerCase(), n));
  const at = (row: ExcelJS.Row, header: string) => {
    const n = col.get(header.toLowerCase());
    return n ? text(row.getCell(n).value) : '';
  };
  if (!col.has('rate') || (!col.has('product #') && !col.has('product'))) {
    return {
      items: [],
      problems: [
        { row: 1, message: 'Use the downloaded template: it needs Product # / Product and Rate.' },
      ],
    };
  }

  const bySku = new Map(products.map((p) => [String(p.sku), p]));
  const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));
  const items: RateListLine[] = [];
  const problems: RateListUploadResult['problems'] = [];
  const seen = new Set<string>();

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const sku = at(row, 'Product #');
    const name = at(row, 'Product');
    const rateText = at(row, 'Rate');
    if (!sku && !name) return; // blank or note row
    if (!/^\d/.test(sku) && !name) return;
    const product = (sku && bySku.get(sku)) || byName.get(name.toLowerCase());
    if (!product) {
      problems.push({ row: n, message: `Unknown product "${sku || name}".` });
      return;
    }
    if (!product.isActive) {
      problems.push({ row: n, message: `${product.name} is inactive.` });
      return;
    }
    const basis = parseBasis(at(row, 'Basis'), defaultRateBasis(product.category));
    if (!basis) {
      problems.push({ row: n, message: 'Basis must be "Per 40 kg" or "Per pack".' });
      return;
    }
    const na = /^n\/?a$/i.test(rateText);
    const available = parseAvailable(at(row, 'Available'));
    if (available === undefined) {
      problems.push({ row: n, message: 'Available must be Yes or No.' });
      return;
    }
    const parsed = rateListItemInputSchema.safeParse({
      productId: product.id,
      cropYear: at(row, 'Crop Year'),
      basis,
      rate: na ? null : rateText.replace(/,/g, ''),
      isAvailable: na ? false : (available ?? rateText !== ''),
      note: at(row, 'Note'),
    });
    if (!parsed.success) {
      problems.push({ row: n, message: parsed.error.issues[0]?.message ?? 'Invalid row.' });
      return;
    }
    const v = parsed.data;
    const key = `${product.id}|${v.cropYear ?? ''}`;
    if (seen.has(key)) {
      problems.push({ row: n, message: `${product.name} ${v.cropYear ?? ''} is listed twice.` });
      return;
    }
    seen.add(key);
    const values: LineValues = {
      cropYear: v.cropYear,
      basis: v.basis,
      rate: v.rate,
      isAvailable: v.isAvailable,
      note: v.note,
    };
    items.push(toLine(product, values, previousRates));
  });

  return { items, problems };
}
