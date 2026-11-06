import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TextItem } from '../src/invoice-pdfs/invoice-pdf';

/** Text positions read from the owner's sample invoices (contact numbers removed). */
export const invoiceItems = (name: string): TextItem[] =>
  JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'invoice-pdf', `${name}.json`), 'utf8'),
  ) as TextItem[];

const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?');

/**
 * Writes a real (minimal) PDF with each text run at its original position, so tests can
 * upload invoices that read like the owner's without committing the original files.
 */
export function pdfFromItems(items: TextItem[]): Buffer {
  const pages = [...new Set(items.map((i) => i.p))].sort((a, b) => a - b);
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) - 1 + 1; // 1-based object numbers
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('PAGES');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids: number[] = [];
  for (const p of pages) {
    const text = items
      .filter((i) => i.p === p)
      .map((i) => `BT /F1 7 Tf ${i.x.toFixed(1)} ${i.y.toFixed(1)} Td (${esc(i.s)}) Tj ET`)
      .join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
