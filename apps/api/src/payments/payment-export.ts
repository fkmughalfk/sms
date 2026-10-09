import { type PaymentRow, sum } from '@sms/shared';
import ExcelJS from 'exceljs';

/** Payments as .xlsx (shaped like the Excel `tblPayments`) with a totals row. */
export async function buildPaymentWorkbook(rows: PaymentRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sales Management System';
  const ws = wb.addWorksheet('Payments', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: 'Date', key: 'paymentDate', width: 12 },
    { header: 'Party', key: 'party', width: 28 },
    { header: 'Sub Party', key: 'subParty', width: 18 },
    { header: 'Slip No.', key: 'slipNo', width: 14 },
    { header: 'Bank', key: 'bank', width: 16 },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Remarks', key: 'remarks', width: 30 },
    { header: 'Entered by', key: 'createdBy', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const r of rows) {
    ws.addRow({
      paymentDate: r.paymentDate,
      party: r.party.name,
      subParty: r.subParty?.name ?? '',
      slipNo: r.slipNo ?? '',
      bank: r.bank?.name ?? '',
      amount: Number(r.amount), // display only; the total below is summed with Decimal
      remarks: r.remarks ?? '',
      createdBy: r.createdBy.name,
    });
  }
  const total = ws.addRow({ bank: 'TOTAL', amount: Number(sum(rows.map((r) => r.amount))) });
  total.font = { bold: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
