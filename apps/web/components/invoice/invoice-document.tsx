import {
  formatCommission,
  formatKg,
  formatNumber,
  formatPKR,
  formatQty,
  formatTons,
  type InvoiceDetail,
  type Settings,
} from '@sms/shared';

/** The invoice as a document — shown on the detail page and printed (spec §5.2 "Print"). */
export function InvoiceDocument({
  invoice,
  settings,
  showCommission = true,
}: {
  invoice: InvoiceDetail;
  settings?: Settings;
  showCommission?: boolean;
}) {
  const [y, m, d] = invoice.invoiceDate.split('-');
  return (
    <article className="grid gap-5 rounded-lg border bg-card p-6 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-wide">
            {settings?.companyName ?? 'WAQAR RICE MILLS'}
          </h2>
          <p className="text-sm text-muted-foreground">{settings?.companyAddress}</p>
        </div>
        <div className="text-right">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Sales Invoice</p>
          <p className="text-2xl font-semibold tabular-nums">#{invoice.invoiceNo}</p>
          <p className="text-sm tabular-nums">{`${d}-${m}-${y}`}</p>
        </div>
      </header>

      <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 [&_dt]:text-muted-foreground">
        <div className="flex gap-2">
          <dt className="w-24">Party</dt>
          <dd className="font-medium">{invoice.party.name}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24">City</dt>
          <dd>{invoice.city?.name ?? '—'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24">Sub Party</dt>
          <dd>{invoice.subParty?.name ?? '—'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24">ASM</dt>
          <dd>{invoice.salesperson?.name ?? '—'}</dd>
        </div>
        {invoice.remarks && (
          <div className="flex gap-2 sm:col-span-2">
            <dt className="w-24">Remarks</dt>
            <dd>{invoice.remarks}</dd>
          </div>
        )}
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y text-xs text-muted-foreground">
            <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:font-medium">
              <th className="text-left">Sr</th>
              <th className="text-left">Description</th>
              <th className="text-right">Bags</th>
              <th className="text-right">Pack Wt</th>
              <th className="text-right">Rate 40Kg</th>
              <th className="text-right">Rate/Pack</th>
              <th className="text-right">Amount</th>
              {showCommission && <th className="text-right">Commission</th>}
              <th className="text-right">Weight (KG)</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-b [&>td]:px-2 [&>td]:py-1.5">
                <td>{l.lineNo}</td>
                <td className="font-sans">{l.product.name}</td>
                <td className="text-right">{formatQty(l.qtyPacks)}</td>
                <td className="text-right">{formatKg(l.packWeightKg)}</td>
                <td className="text-right">{formatNumber(l.rate40Kg, 2)}</td>
                <td className="text-right">{formatNumber(l.ratePerPack, 2)}</td>
                <td className="text-right font-medium">{formatPKR(l.amount)}</td>
                {showCommission && <td className="text-right">{formatCommission(l.commission)}</td>}
                <td className="text-right">{formatKg(l.weightKg)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="tabular-nums font-semibold">
            <tr className="[&>td]:px-2 [&>td]:py-2">
              <td />
              <td>Total</td>
              <td className="text-right">{formatQty(invoice.totalPacks)}</td>
              <td colSpan={3} />
              <td className="text-right">{formatPKR(invoice.totalAmount)}</td>
              {showCommission && (
                <td className="text-right">{formatCommission(invoice.totalCommission)}</td>
              )}
              <td className="text-right">{formatKg(invoice.totalWeightKg)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap justify-between gap-4 text-sm">
        <p className="text-muted-foreground">
          {formatQty(invoice.totalPacks)} bags · {formatTons(invoice.totalWeightKg)} tons
        </p>
        <p className="text-lg font-semibold tabular-nums">
          Total PKR {formatPKR(invoice.totalAmount)}
        </p>
      </div>
    </article>
  );
}
