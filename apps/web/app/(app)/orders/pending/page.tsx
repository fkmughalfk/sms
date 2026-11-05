'use client';

import { formatNumber, formatPKR, partyOptionSchema } from '@sms/shared';
import { ArrowLeft, ClipboardList, Printer } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { z } from 'zod';
import { Combobox } from '@/components/combobox';
import { PageHeading } from '@/components/form-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';
import { formatOrderDate, packText, packWord, usePendingReport } from '@/lib/orders';
import { formatRate, shortCropYear } from '@/lib/rate-lists';

const partyOptionsSchema = z.array(partyOptionSchema);
const num = (s: string) => formatNumber(s, 0);

/**
 * "WAQAR RICE MILLS PENDING ORDERS DETAIL" — every order line with bags still to deliver,
 * grouped by city. Pick a party to print its own sheet, or print everyone (landscape).
 */
export default function PendingReportPage() {
  const parties = useMasterOptions('parties', partyOptionsSchema);
  const cities = useMasterOptions('cities');
  const salespersons = useMasterOptions('salespersons');
  const [partyId, setPartyId] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [salespersonId, setSalespersonId] = useState<string | null>(null);
  const [cropYear, setCropYear] = useState('');
  const query = new URLSearchParams({
    ...(partyId ? { partyId } : {}),
    ...(cityId ? { cityId } : {}),
    ...(salespersonId ? { salespersonId } : {}),
    ...(/^\d{2,4}\s*[-/]\s*\d{2,4}$/.test(cropYear.trim()) ? { cropYear: cropYear.trim() } : {}),
  }).toString();
  const report = usePendingReport(query);
  const r = report.data;

  return (
    <div className="grid gap-5">
      {/* The printed sheet is landscape like the old report. */}
      <style>{'@media print { @page { size: A4 landscape; margin: 8mm; } }'}</style>
      <div className="no-print grid gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
            <Link href="/orders">
              <ArrowLeft /> Orders
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1">
              <PageHeading icon={ClipboardList} tone="sky">
                Pending orders
              </PageHeading>
              <p className="text-sm text-muted-foreground">
                Bags still to deliver, at the booked rate. Pick a party to print its own sheet.
              </p>
            </div>
            <Button variant="outline" onClick={() => window.print()} disabled={!r}>
              <Printer /> Print / PDF
            </Button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Combobox
            options={toComboboxOptions(parties.data)}
            value={partyId}
            onChange={setPartyId}
            noneLabel="All parties"
            placeholder="All parties"
          />
          <Combobox
            options={toComboboxOptions(cities.data)}
            value={cityId}
            onChange={setCityId}
            noneLabel="All cities"
            placeholder="All cities"
          />
          <Combobox
            options={toComboboxOptions(salespersons.data)}
            value={salespersonId}
            onChange={setSalespersonId}
            noneLabel="All salesmen"
            placeholder="All salesmen"
          />
          <Input
            aria-label="Crop year"
            placeholder="Crop year (e.g. 25-26)"
            value={cropYear}
            onChange={(e) => setCropYear(e.target.value)}
          />
        </div>
      </div>

      {report.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {report.error && <p className="text-sm text-destructive">{report.error.message}</p>}
      {r && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-2">
            <div>
              <h2 className="text-lg font-bold tracking-wide">
                WAQAR RICE MILLS PENDING ORDERS DETAIL
              </h2>
              <p className="text-sm text-muted-foreground">Dated {formatOrderDate(r.date)}</p>
            </div>
            <p className="text-sm">
              Last order no. <span className="font-semibold">{r.lastOrderNo ?? '—'}</span>
            </p>
          </div>

          {r.groups.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nothing pending.
            </p>
          )}

          {r.groups.map((g) => (
            <section key={g.city} className="break-inside-avoid-page">
              <h3 className="bg-muted px-3 py-1.5 text-sm font-bold uppercase">{g.city}</h3>

              {/* Phone: one card per line. */}
              <ul className="divide-y rounded-b-lg border md:hidden print:hidden">
                {g.lines.map((l) => (
                  <li
                    key={`${l.orderId}-${l.product.id}-${l.cropYear}`}
                    className="px-3 py-2.5 text-sm"
                  >
                    <div className="flex justify-between gap-2">
                      <Link href={`/orders/${l.orderId}`} className="min-w-0 truncate font-medium">
                        {l.orderNo} · {l.party.name}
                      </Link>
                      <span className="font-semibold tabular-nums">
                        {formatPKR(l.pendingAmount)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {l.product.name} {packText(l.packWeightKg, l.packPcs)}
                      {l.cropYear && ` · ${shortCropYear(l.cropYear)}`} @ {formatRate(l.rate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatOrderDate(l.orderDate)} · ordered {num(String(l.qtyPacks))} · sent{' '}
                      {num(String(l.dispatchedPacks))} ·{' '}
                      <span className="font-medium text-foreground">
                        {num(String(l.pendingPacks))} {packWord(l.packPcs, l.pendingPacks)} pending
                      </span>{' '}
                      ({num(l.pendingWeightKg)} kg)
                    </p>
                  </li>
                ))}
              </ul>

              {/* Desktop and print: the old report's columns. */}
              <div className="hidden overflow-x-auto md:block print:block">
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground [&>th]:px-2 [&>th]:py-1.5 [&>th]:font-medium">
                      <th>Date</th>
                      <th>Party</th>
                      <th className="text-right">Order</th>
                      <th>Salesman</th>
                      <th>Product</th>
                      <th>Pack</th>
                      <th>Crop</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Wt</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Dispatched</th>
                      <th className="text-right">Balance</th>
                      <th className="text-right">Wt rem.</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lines.map((l) => (
                      <tr
                        key={`${l.orderId}-${l.product.id}-${l.cropYear}`}
                        className="border-b [&>td]:px-2 [&>td]:py-1.5"
                      >
                        <td className="whitespace-nowrap">{formatOrderDate(l.orderDate)}</td>
                        <td>{l.party.name}</td>
                        <td className="text-right">
                          <Link href={`/orders/${l.orderId}`} className="hover:underline">
                            {l.orderNo}
                          </Link>
                        </td>
                        <td>{l.salesperson?.name ?? ''}</td>
                        <td>{l.product.name}</td>
                        <td className="whitespace-nowrap">{packText(l.packWeightKg, l.packPcs)}</td>
                        <td className="whitespace-nowrap">{shortCropYear(l.cropYear)}</td>
                        <td className="text-right">{num(String(l.qtyPacks))}</td>
                        <td className="text-right">{num(l.weightKg)}</td>
                        <td className="text-right">{formatRate(l.rate)}</td>
                        <td className="text-right">
                          {l.dispatchedPacks ? num(String(l.dispatchedPacks)) : ''}
                        </td>
                        <td className="text-right font-medium">{num(String(l.pendingPacks))}</td>
                        <td className="text-right">{num(l.pendingWeightKg)}</td>
                        <td className="text-right font-semibold">{formatPKR(l.pendingAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold [&>td]:px-2 [&>td]:py-1.5">
                      <td colSpan={11} className="text-right uppercase">
                        {g.city} PENDINGS
                      </td>
                      <td className="text-right">{num(String(g.totals.pendingPacks))}</td>
                      <td className="text-right">{num(g.totals.pendingWeightKg)}</td>
                      <td className="text-right">{formatPKR(g.totals.pendingAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-1 flex justify-between px-1 text-sm font-semibold uppercase md:hidden print:hidden">
                <span>
                  {g.city} pendings: {num(String(g.totals.pendingPacks))} ·{' '}
                  {num(g.totals.pendingWeightKg)} kg
                </span>
                <span>{formatPKR(g.totals.pendingAmount)}</span>
              </p>
            </section>
          ))}

          {r.groups.length > 0 && (
            <div className="flex flex-wrap justify-between gap-2 rounded-lg border-2 px-4 py-3 font-bold">
              <span>TOTAL PENDINGS</span>
              <span className="tabular-nums">
                {num(String(r.totals.pendingPacks))} packs · {num(r.totals.pendingWeightKg)} kg · Rs{' '}
                {formatPKR(r.totals.pendingAmount)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
