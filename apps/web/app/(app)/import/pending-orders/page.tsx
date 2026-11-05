'use client';

import {
  formatNumber,
  type OpeningImportReport,
  openingImportReportSchema,
  type OpeningMapping,
  productOptionSchema,
} from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, ClipboardList, X } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Combobox } from '@/components/combobox';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeading } from '@/components/form-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';
import { cn } from '@/lib/utils';

type PartyChoice = OpeningMapping['parties'][string];
type SpChoice = OpeningMapping['salespersons'][string];
const EMPTY: OpeningMapping = { products: {}, parties: {}, salespersons: {} };
const productOptionsSchema = z.array(productOptionSchema);

function Card({ title, children, warn }: { title: string; children: ReactNode; warn?: boolean }) {
  return (
    <section
      className={cn(
        'grid min-w-0 gap-3 rounded-xl border bg-card p-4 shadow-sm',
        warn && 'border-amber-500/60',
      )}
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Pre-fills each unmatched name with the system's guess, keeping what was already chosen. */
function withSuggestions(r: OpeningImportReport, cur: OpeningMapping): OpeningMapping {
  const next: OpeningMapping = {
    products: { ...cur.products },
    parties: { ...cur.parties },
    salespersons: { ...cur.salespersons },
  };
  for (const u of r.unmatched.products) {
    if (!next.products[u.key] && u.suggestion) next.products[u.key] = u.suggestion.id;
  }
  for (const u of r.unmatched.parties) {
    if (!next.parties[u.key]) {
      next.parties[u.key] = u.suggestion
        ? { action: 'map', partyId: u.suggestion.id }
        : { action: 'create' };
    }
  }
  for (const u of r.unmatched.salespersons) {
    if (!next.salespersons[u.key]) {
      next.salespersons[u.key] = u.suggestion
        ? { action: 'map', salespersonId: u.suggestion.id }
        : { action: 'create' };
    }
  }
  return next;
}

/**
 * Go-live (orders module phase O3): load the old "PENDING ORDERS DETAIL" as opening orders.
 * Check first; names the system doesn't know are mapped once and remembered.
 */
export default function PendingOrdersImportPage() {
  const queryClient = useQueryClient();
  const products = useMasterOptions('products', productOptionsSchema);
  const parties = useMasterOptions('parties');
  const salespersons = useMasterOptions('salespersons');
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<OpeningImportReport | null>(null);
  const [mapping, setMapping] = useState<OpeningMapping>(EMPTY);
  const [checked, setChecked] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const send = useMutation({
    mutationFn: ({ dryRun, map }: { dryRun: boolean; map: OpeningMapping }) => {
      const form = new FormData();
      form.append('file', file!);
      form.append('dryRun', String(dryRun));
      form.append('mapping', JSON.stringify(map));
      return api.upload('/orders/opening-import', openingImportReportSchema, form);
    },
    onSuccess: (r, { map }) => {
      setReport(r);
      if (r.dryRun) {
        const next = withSuggestions(r, map);
        setMapping(next);
        setChecked(JSON.stringify(map));
      } else {
        toast.success(`Imported ${r.created?.orders ?? 0} opening orders.`);
        void queryClient.invalidateQueries();
      }
      setConfirming(false);
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { report?: unknown } | undefined) : undefined;
      const parsed = openingImportReportSchema.safeParse(body?.report);
      if (parsed.success) setReport(parsed.data);
      toast.error(e instanceof ApiError ? e.message : 'Upload failed.');
      setConfirming(false);
    },
  });

  const check = () => send.mutate({ dryRun: true, map: mapping });
  const upToDate = checked === JSON.stringify(mapping);
  const canImport = !!report?.dryRun && report.ready && upToDate && !send.isPending;
  const unmatchedCount = report
    ? report.unmatched.products.length +
      report.unmatched.parties.length +
      report.unmatched.salespersons.length
    : 0;

  const setProduct = (key: string, id: string | null) =>
    setMapping((m) => {
      const productsMap = { ...m.products };
      if (id) productsMap[key] = id;
      else delete productsMap[key];
      return { ...m, products: productsMap };
    });
  const setParty = (key: string, c: PartyChoice) =>
    setMapping((m) => ({ ...m, parties: { ...m.parties, [key]: c } }));
  const setSp = (key: string, c: SpChoice) =>
    setMapping((m) => ({ ...m, salespersons: { ...m.salespersons, [key]: c } }));

  const productOptions = (products.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
    hint: `#${p.sku} · ${p.packWeightKg} kg`,
  }));

  return (
    <div className="grid max-w-5xl gap-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
          <Link href="/import">
            <ArrowLeft /> Import
          </Link>
        </Button>
        <PageHeading icon={ClipboardList} tone="sky">
          Import pending orders (go-live)
        </PageHeading>
        <p className="text-sm text-muted-foreground">
          Loads the old &quot;PENDING ORDERS DETAIL&quot; as opening orders: their order numbers and
          the bags already dispatched are kept. Use .xlsx or .csv with the report&apos;s columns
          (DATE, PARTY NAME, ORDER NO, SALES PERSON, PRODUCT, KG, CROP YEAR, QTY, RATE, TOTAL
          DISPAT…). Nothing is written until you press Import; running it again skips orders already
          there.
        </p>
      </div>

      <Card title="1. File">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            accept=".xlsx,.csv"
            className="max-w-sm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReport(null);
              setMapping(EMPTY);
              setChecked(null);
            }}
          />
          <Button disabled={!file || send.isPending} onClick={check}>
            {send.isPending ? 'Checking…' : report ? 'Check again' : 'Check file'}
          </Button>
        </div>
      </Card>

      {report && (
        <>
          <Card title="2. What the file holds">
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              <li>
                {report.summary.rows} rows → <b>{report.summary.orders.create}</b> orders to create
                ({report.summary.orders.lines} lines)
                {report.summary.orders.exists > 0 &&
                  `, ${report.summary.orders.exists} already imported`}
              </li>
              <li>
                New: {report.summary.parties.create} parties, {report.summary.cities.create} cities,{' '}
                {report.summary.salespersons.create} salesmen
              </li>
            </ul>
            {report.comparison.length > 0 && (
              <table className="text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-muted-foreground [&>th]:py-1 [&>th]:pr-6 [&>th]:font-medium">
                    <th>Check</th>
                    <th className="text-right">In the file</th>
                    <th className="text-right">Worked out</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {report.comparison.map((c) => (
                    <tr key={c.metric} className="[&>td]:py-1 [&>td]:pr-6">
                      <td>{c.metric}</td>
                      <td className="text-right">{formatNumber(c.file, 0)}</td>
                      <td className="text-right">{formatNumber(c.computed, 0)}</td>
                      <td>
                        {c.matches ? (
                          <Check className="size-4 text-emerald-600" />
                        ) : (
                          <X className="size-4 text-rose-600" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {report.mismatches.length > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {report.mismatches.length} line(s) work out differently from the file (rows{' '}
                {report.mismatches
                  .slice(0, 10)
                  .map((m) => m.row)
                  .join(', ')}
                ). They are imported with the system&apos;s figure.
              </p>
            )}
          </Card>

          {report.problems.length > 0 && (
            <Card title={`Rows to fix in the file (${report.problems.length})`} warn>
              <ul className="list-disc pl-5 text-sm">
                {report.problems.slice(0, 50).map((p) => (
                  <li key={`${p.row}-${p.message}`}>
                    {p.row > 0 && `Row ${p.row}: `}
                    {p.message}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {unmatchedCount > 0 && (
            <Card title={`3. Names to decide (${unmatchedCount}) — remembered for next time`} warn>
              {report.unmatched.products.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Products</p>
                  {report.unmatched.products.map((u) => (
                    <div
                      key={u.key}
                      className="grid gap-2 sm:grid-cols-[16rem_minmax(0,1fr)] sm:items-center"
                    >
                      <p className="text-sm">
                        <b>{u.text}</b> {u.kg} kg{' '}
                        <span className="text-muted-foreground">
                          ({u.rows} {u.rows === 1 ? 'row' : 'rows'})
                        </span>
                      </p>
                      <Combobox
                        options={productOptions}
                        value={mapping.products[u.key] ?? null}
                        onChange={(v) => setProduct(u.key, v)}
                        placeholder="Choose the product…"
                      />
                    </div>
                  ))}
                </div>
              )}
              {report.unmatched.parties.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Parties</p>
                  {report.unmatched.parties.map((u) => {
                    const c = mapping.parties[u.key];
                    return (
                      <div
                        key={u.key}
                        className="grid gap-2 sm:grid-cols-[16rem_9rem_minmax(0,1fr)] sm:items-center"
                      >
                        <p className="text-sm">
                          <b>{u.text}</b>{' '}
                          <span className="text-muted-foreground">
                            ({u.rows} {u.rows === 1 ? 'row' : 'rows'})
                          </span>
                        </p>
                        <select
                          aria-label={`${u.text}: map or create`}
                          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                          value={c?.action ?? 'create'}
                          onChange={(e) =>
                            setParty(
                              u.key,
                              e.target.value === 'create'
                                ? { action: 'create' }
                                : { action: 'map', partyId: u.suggestion?.id ?? '' },
                            )
                          }
                        >
                          <option value="map">Same as…</option>
                          <option value="create">New party</option>
                        </select>
                        {c?.action === 'map' ? (
                          <Combobox
                            options={toComboboxOptions(parties.data)}
                            value={c.partyId || null}
                            onChange={(v) => v && setParty(u.key, { action: 'map', partyId: v })}
                            placeholder="Choose the party…"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Creates &quot;{u.text}&quot; with the city and salesman from the file.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {report.unmatched.salespersons.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Salesmen</p>
                  {report.unmatched.salespersons.map((u) => {
                    const c = mapping.salespersons[u.key];
                    return (
                      <div
                        key={u.key}
                        className="grid gap-2 sm:grid-cols-[16rem_9rem_minmax(0,1fr)] sm:items-center"
                      >
                        <p className="text-sm">
                          <b>{u.text}</b>{' '}
                          <span className="text-muted-foreground">
                            ({u.rows} {u.rows === 1 ? 'row' : 'rows'})
                          </span>
                        </p>
                        <select
                          aria-label={`${u.text}: map, create or none`}
                          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                          value={c?.action ?? 'create'}
                          onChange={(e) =>
                            setSp(
                              u.key,
                              e.target.value === 'map'
                                ? { action: 'map', salespersonId: u.suggestion?.id ?? '' }
                                : { action: e.target.value as 'create' | 'none' },
                            )
                          }
                        >
                          <option value="map">Same as…</option>
                          <option value="create">New salesman</option>
                          <option value="none">No salesman</option>
                        </select>
                        {c?.action === 'map' && (
                          <Combobox
                            options={toComboboxOptions(salespersons.data)}
                            value={c.salespersonId || null}
                            onChange={(v) => v && setSp(u.key, { action: 'map', salespersonId: v })}
                            placeholder="Choose the salesman…"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Suggestions are filled in for you — check them, then press Check again.
              </p>
            </Card>
          )}

          <Card title={report.dryRun ? '4. Import' : 'Done'}>
            {report.dryRun ? (
              <>
                {!report.ready && (
                  <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4" />
                    {unmatchedCount > 0
                      ? 'Decide the names above, then press Check again.'
                      : 'Fix the rows above in the file, then check it again.'}
                  </p>
                )}
                {report.ready && !upToDate && (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    The choices changed — press Check again before importing.
                  </p>
                )}
                <div className="flex gap-2">
                  {(!upToDate || !report.ready) && (
                    <Button variant="outline" disabled={!file || send.isPending} onClick={check}>
                      Check again
                    </Button>
                  )}
                  <Button disabled={!canImport} onClick={() => setConfirming(true)}>
                    Import {report.summary.orders.create} orders
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm">
                Created {report.created?.orders} orders ({report.created?.lines} lines),{' '}
                {report.created?.parties} parties; remembered {report.created?.aliases} names.{' '}
                <Link href="/orders/pending" className="font-medium underline">
                  Open the pending report
                </Link>
              </p>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Import ${report?.summary.orders.create ?? 0} opening orders?`}
        description="They become pending orders with their old numbers. Running it again later skips them."
        confirmLabel="Import"
        busy={send.isPending}
        onConfirm={() => send.mutate({ dryRun: false, map: mapping })}
      />
    </div>
  );
}
