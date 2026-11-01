'use client';

import {
  businessToday,
  dec,
  formatPKR2,
  partyLedgerSchema,
  type PartyPosition,
  partyPositionSchema,
} from '@sms/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Printer, BookOpen, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/use-invoice';
import { statementMessage, waLink } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';
import { PageHeading } from '@/components/form-section';
import { ReceivePaymentDialog } from '@/components/payment/receive-payment-dialog';

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
  const [receiving, setReceiving] = useState(false);

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const { data, isPending, error } = useQuery({
    queryKey: ['recovery', 'ledger', partyId, params.toString()],
    queryFn: () => api.get(`/recovery/parties/${partyId}/ledger?${params}`, partyLedgerSchema),
    placeholderData: keepPreviousData,
  });
  // Credit terms, overdue and ageing are always "as of today", whatever the date filter.
  const position = useQuery({
    queryKey: ['recovery', 'position', partyId],
    queryFn: () => api.get(`/recovery/parties/${partyId}/position`, partyPositionSchema),
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
          {position.data && (
            <Button
              asChild
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
            >
              <a
                href={waLink(
                  data.party.phone,
                  statementMessage(
                    settings.data?.companyName ?? 'WAQAR RICE MILLS',
                    position.data,
                    businessToday(),
                    lastPayment(data.entries),
                  ),
                )}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  data.party.phone
                    ? `Send the statement to ${data.party.phone} on WhatsApp`
                    : 'No phone saved — WhatsApp will ask which chat'
                }
              >
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          )}
          {can('payment.create') && (
            <Button onClick={() => setReceiving(true)}>
              <Plus /> Record payment
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

        {position.data && <AgeingPanel p={position.data} />}

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

      <ReceivePaymentDialog
        party={receiving ? data.party : null}
        onOpenChange={(o) => !o && setReceiving(false)}
      />
    </div>
  );
}

function lastPayment(entries: { type: string; date: string; credit: string }[]) {
  const pay = entries.filter((e) => e.type === 'PAYMENT').at(-1);
  return pay ? { date: pay.date, amount: pay.credit } : null;
}

/** Credit terms and how old the unpaid balance is (Phase 2), as of today. */
function AgeingPanel({ p }: { p: PartyPosition }) {
  const overdue = dec(p.overdue);
  const buckets: [string, string][] = [
    ['0–30 days', p.ageing.d0_30],
    ['31–60 days', p.ageing.d31_60],
    ['61–90 days', p.ageing.d61_90],
    ['Over 90 days', p.ageing.d90plus],
  ];
  return (
    <section aria-label="Ageing" className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          Credit {p.creditDays} days
          {p.creditLimit !== null && <> · limit PKR {formatPKR2(p.creditLimit)}</>}
        </p>
        <p
          className={cn(
            'font-semibold',
            overdue.gt(0)
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {overdue.gt(0)
            ? `Overdue PKR ${formatPKR2(overdue)}${p.oldestOverdueDays !== null ? ` · oldest ${p.oldestOverdueDays} days` : ''}`
            : 'Nothing overdue'}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {buckets.map(([label, value], i) => (
          <div
            key={label}
            className={cn(
              'rounded-lg border px-3 py-2',
              dec(value).gt(0) && [0, 31, 61, 91][i]! > p.creditDays
                ? 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10'
                : 'bg-muted/40',
            )}
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">{formatPKR2(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
