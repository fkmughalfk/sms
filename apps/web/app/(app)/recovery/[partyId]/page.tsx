'use client';

import { businessToday, dec, formatPKR2, partyLedgerSchema } from '@sms/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Printer, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/use-invoice';
import { cn } from '@/lib/utils';
import { PageHeading } from '@/components/form-section';

const toDisplayDate = (d: string) => d.split('-').reverse().join('-');

/** Running balance: positive = party owes; negative = advance. */
function Balance({ value }: { value: string }) {
  const d = dec(value);
  return (
    <span className={cn(d.lt(0) && 'text-emerald-600 dark:text-emerald-400')}>
      {formatPKR2(d.abs())} {d.lt(0) ? 'Cr' : 'Dr'}
    </span>
  );
}

/** Spec §5.4 — party ledger: invoices (debit), payments (credit), running balance. Printable. */
export default function PartyLedgerPage() {
  const { partyId } = useParams<{ partyId: string }>();
  const { can } = useAuth();
  const settings = useSettings();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const { data, isPending, error } = useQuery({
    queryKey: ['recovery', 'ledger', partyId, params.toString()],
    queryFn: () => api.get(`/recovery/parties/${partyId}/ledger?${params}`, partyLedgerSchema),
    placeholderData: keepPreviousData,
  });

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  const period =
    data.from || data.to
      ? `${data.from ? toDisplayDate(data.from) : 'Start'} to ${data.to ? toDisplayDate(data.to) : 'today'}`
      : `All activity to ${toDisplayDate(businessToday())}`;

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/recovery"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-3" /> Recovery
          </Link>
          <PageHeading icon={BookOpen} tone="rose">
            {data.party.name}
          </PageHeading>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">
            From
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            To
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          {can('payment.create') && (
            <Button asChild>
              <Link href="/payments/new">
                <Plus /> Record payment
              </Link>
            </Button>
          )}
        </div>
      </div>

      <article className="grid gap-4 rounded-lg border bg-card p-6 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-lg font-bold tracking-wide">
              {settings.data?.companyName ?? 'WAQAR RICE MILLS'}
            </h2>
            <p className="text-sm text-muted-foreground">{settings.data?.companyAddress}</p>
          </div>
          <div className="text-right">
            <p className="text-sm uppercase tracking-wide text-muted-foreground">Party ledger</p>
            <p className="text-lg font-semibold">{data.party.name}</p>
            <p className="text-sm text-muted-foreground">
              {[data.party.city?.name, data.party.phone].filter(Boolean).join(' · ')}
            </p>
            <p className="text-xs text-muted-foreground">{period}</p>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:font-medium">
                <th className="text-left">Date</th>
                <th className="text-left">Reference</th>
                <th className="text-left">Details</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-b bg-muted/40 [&>td]:px-2 [&>td]:py-1.5">
                <td>{data.from ? toDisplayDate(data.from) : ''}</td>
                <td colSpan={4} className="font-medium">
                  {data.from ? 'Balance brought forward' : 'Opening balance'}
                </td>
                <td className="text-right font-medium">
                  <Balance value={data.broughtForward} />
                </td>
              </tr>
              {data.entries.map((e) => (
                <tr key={`${e.type}-${e.refId}`} className="border-b [&>td]:px-2 [&>td]:py-1.5">
                  <td>{toDisplayDate(e.date)}</td>
                  <td>
                    {e.type === 'INVOICE' ? (
                      <Link
                        href={`/invoices/${e.refId}`}
                        className="hover:underline print:no-underline"
                      >
                        {e.reference}
                      </Link>
                    ) : (
                      e.reference
                    )}
                  </td>
                  <td className="font-sans text-muted-foreground">{e.description}</td>
                  <td className="text-right">{e.type === 'INVOICE' ? formatPKR2(e.debit) : ''}</td>
                  <td className="text-right">{e.type === 'PAYMENT' ? formatPKR2(e.credit) : ''}</td>
                  <td className="text-right">
                    <Balance value={e.balance} />
                  </td>
                </tr>
              ))}
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">
                    No invoices or payments in this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="font-semibold tabular-nums">
              <tr className="[&>td]:px-2 [&>td]:py-2">
                <td colSpan={3}>Closing balance</td>
                <td className="text-right">{formatPKR2(data.totalDebit)}</td>
                <td className="text-right">{formatPKR2(data.totalCredit)}</td>
                <td className="text-right">
                  <Balance value={data.closingBalance} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Dr = the party owes you · Cr = paid in advance.
        </p>
      </article>
    </div>
  );
}
