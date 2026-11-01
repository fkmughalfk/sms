import {
  dec,
  formatKg,
  formatNumber,
  formatPKR,
  formatQty,
  type InvoiceDetail,
  type PartyPosition,
} from '@sms/shared';

// "Share on WhatsApp" (Phase 2): opens WhatsApp with a ready message — free, no API.
// The user picks the chat and presses send; nothing is sent automatically.

const ddmmyyyy = (d: string) => d.split('-').reverse().join('-');

/**
 * A Pakistani number in the international form wa.me needs ("923001234567"), or null.
 * Accepts "0300-1234567", "+92 300 1234567", "3001234567", "00923001234567".
 */
export function waPhone(phone: string | null | undefined): string | null {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = `92${d.slice(1)}`;
  else if (d.length === 10 && d.startsWith('3')) d = `92${d}`;
  return /^92\d{10}$/.test(d) ? d : null;
}

/** wa.me link; without a usable phone WhatsApp asks which chat to send to. */
export function waLink(phone: string | null | undefined, text: string): string {
  const to = waPhone(phone);
  return `https://wa.me/${to ?? ''}?text=${encodeURIComponent(text)}`;
}

/** Account statement summary for a party (from the ledger page). */
export function statementMessage(
  company: string,
  p: PartyPosition,
  today: string,
  lastPayment?: { date: string; amount: string } | null,
): string {
  const owes = dec(p.outstanding);
  const lines = [
    `*${company}*`,
    `Account statement — ${p.party.name}`,
    `As of ${ddmmyyyy(today)}`,
    '',
    owes.gte(0)
      ? `Balance due: PKR ${formatPKR(owes)}`
      : `Advance with us: PKR ${formatPKR(owes.negated())}`,
  ];
  if (dec(p.overdue).gt(0)) {
    lines.push(`Overdue (over ${p.creditDays} days): PKR ${formatPKR(p.overdue)}`);
  }
  if (lastPayment) {
    lines.push(
      `Last payment: PKR ${formatPKR(lastPayment.amount)} on ${ddmmyyyy(lastPayment.date)}`,
    );
  }
  if (owes.gt(0)) lines.push('', 'Kindly arrange the payment. Thank you.');
  return lines.join('\n');
}

/** Invoice summary (from the invoice page). */
export function invoiceMessage(company: string, invoice: InvoiceDetail): string {
  return [
    `*${company}*`,
    `Invoice #${invoice.invoiceNo} — ${ddmmyyyy(invoice.invoiceDate)}`,
    invoice.party.name,
    '',
    ...invoice.lines.map(
      (l) =>
        `${l.lineNo}. ${l.product.name}: ${formatQty(l.qtyPacks)} × ${formatNumber(l.rate40Kg, 2)}/40kg = PKR ${formatPKR(l.amount)}`,
    ),
    '',
    `Qty ${formatQty(invoice.totalPacks)} · ${formatKg(invoice.totalWeightKg)} KG`,
    `*Total: PKR ${formatPKR(invoice.totalAmount)}*`,
  ].join('\n');
}
