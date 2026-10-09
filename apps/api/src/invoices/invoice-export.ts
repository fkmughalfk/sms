import { type InvoiceLineRow, sum } from '@sms/shared';
import ExcelJS from 'exceljs';

/**
 * The Lines view as an .xlsx shaped like the Excel `tblLines` sheet, with a totals
 * row. Values are summed with Decimal; cells get numbers only for display in Excel.
 */
export async function buildInvoiceWorkbook(rows: InvoiceLineRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sales Management System';
  const ws = wb.addWorksheet('Lines', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: 'Invoice #', key: 'invoiceNo', width: 10 },
    { header: 'Date', key: 'invoiceDate', width: 12 },
    { header: 'Party', key: 'party', width: 28 },
    { header: 'City', key: 'city', width: 14 },
    { header: 'ASM', key: 'salesperson', width: 18 },
    { header: 'Product #', key: 'sku', width: 10 },
    { header: 'Description', key: 'product', width: 32 },
    { header: 'Category', key: 'category', width: 10 },
    { header: 'Bags', key: 'qtyPacks', width: 8, style: { numFmt: '#,##0' } },
    { header: 'Pack Wt (KG)', key: 'packWeightKg', width: 12, style: { numFmt: '#,##0.###' } },
    { header: 'Rate 40Kg', key: 'rate40Kg', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'Rate / Pack', key: 'ratePerPack', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: '#,##0' } },
    { header: 'Commission', key: 'commission', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'Weight (KG)', key: 'weightKg', width: 12, style: { numFmt: '#,##0.###' } },
  ];
  ws.getRow(1).font = { bold: true };

  for (const r of rows) {
    ws.addRow({
      invoiceNo: r.invoiceNo,
      invoiceDate: r.invoiceDate,
      party: r.party.name,
      city: r.city?.name ?? '',
      salesperson: r.salesperson?.name ?? '',
      sku: r.product.sku,
      product: r.product.name,
      category: r.category.name,
      qtyPacks: r.qtyPacks,
      packWeightKg: Number(r.packWeightKg),
      rate40Kg: Number(r.rate40Kg),
      ratePerPack: Number(r.ratePerPack),
      amount: Number(r.amount),
      commission: Number(r.commission),
      weightKg: Number(r.weightKg),
    });
  }

  const total = ws.addRow({
    product: 'TOTAL',
    qtyPacks: rows.reduce((n, r) => n + r.qtyPacks, 0),
    amount: Number(sum(rows.map((r) => r.amount))),
    commission: Number(sum(rows.map((r) => r.commission))),
    weightKg: Number(sum(rows.map((r) => r.weightKg))),
  });
  total.font = { bold: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
