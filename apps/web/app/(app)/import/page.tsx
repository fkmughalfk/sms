'use client';

import {
  formatNumber,
  formatPKR,
  type ImportMapping,
  type ImportReport,
  importReportSchema,
  type PartyMapping,
} from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, FileSpreadsheet, X } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/combobox';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const NO_BANK = '__none__';

function Card({ title, children, tone }: { title: string; children: ReactNode; tone?: 'warn' }) {
  return (
    <section
      className={cn(
        'grid min-w-0 grid-cols-1 gap-3 rounded-lg border bg-card p-4',
        tone === 'warn' && 'border-amber-500/60',
      )}
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Pre-fill decisions from the report's suggestions (the admin can change every one). */
function initialMapping(r: ImportReport, current: ImportMapping): ImportMapping {
  const parties: Record<string, PartyMapping> = { ...current.parties };
  for (const u of r.unmatchedParties) {
    if (!parties[u.key] && u.suggestion) parties[u.key] = { action: 'map', party: u.suggestion };
  }
  const banks: Record<string, string | null> = { ...current.banks };
  for (const b of r.banks) {
    if (!(b.key in banks)) banks[b.key] = b.mapped !== undefined ? b.mapped : b.suggestion;
  }
  return { parties, banks };
}

/** Thousands separators, keeping the figure's own decimals. */
const figure = (v: string | null) =>
  v === null ? '—' : formatNumber(v, v.split('.')[1]?.length ?? 0);

const sameMapping = (a: ImportMapping, b: ImportMapping) => JSON.stringify(a) === JSON.stringify(b);

/** Dashboard over the imported invoices' dates, to compare with the Excel Dashboard. */
function dashboardLink(r: ImportReport) {
  const dates = r.invoices.map((i) => i.invoiceDate).sort();
  return dates.length
    ? `/dashboard?period=custom&from=${dates[0]}&to=${dates.at(-1)}`
    : '/dashboard';
}

/** Spec §11 — one-time Excel import with dry run and name mapping (SUPER_ADMIN). */
export default function ImportPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [checkedWith, setCheckedWith] = useState<ImportMapping | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({ parties: {}, banks: {} });
  const [confirming, setConfirming] = useState(false);

  const send = useMutation({
    mutationFn: ({ dryRun, map }: { dryRun: boolean; map: ImportMapping }) => {
      const form = new FormData();
      form.append('file', file!);
      form.append('dryRun', String(dryRun));
      form.append('mapping', JSON.stringify(map));
      return api.upload('/import/excel', importReportSchema, form);
    },
    onSuccess: (r, { map }) => {
      setReport(r);
      setCheckedWith(map);
      setMapping(initialMapping(r, map));
      if (!r.dryRun) {
        toast.success('Import finished.');
        void queryClient.invalidateQueries();
      }
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { report?: unknown } | undefined) : undefined;
      const parsed = importReportSchema.safeParse(body?.report);
      if (parsed.success) setReport(parsed.data);
      toast.error(e instanceof ApiError ? e.message : 'Upload failed.');
    },
  });

  const check = (map = mapping) => send.mutate({ dryRun: true, map });
  const decided = report?.unmatchedParties.every((u) => mapping.parties[u.key]) ?? false;
  const upToDate = !!checkedWith && sameMapping(checkedWith, mapping);
  const canImport = !!report?.dryRun && report.ready && upToDate && !send.isPending;
  const done = report && !report.dryRun;

  const setParty = (key: string, m: PartyMapping | undefined) =>
    setMapping((cur) => {
      const parties = { ...cur.parties };
      if (m) parties[key] = m;
      else delete parties[key];
      return { ...cur, parties };
    });

  return (
    <div className="grid min-w-0 max-w-5xl grid-cols-1 gap-4">
      <div>
        <h1 className="text-xl font-semibold">Import from Excel</h1>
        <p className="text-sm text-muted-foreground">
          Loads products, lists, invoices (Database sheet) and payments (Payments + Sheet1) from the
          old workbook. Check first — nothing is written until you press Import. Running it again
          only adds what isn&apos;t there yet.
        </p>
      </div>

      <Card title="1. Workbook">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="max-w-sm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReport(null);
              setCheckedWith(null);
              setMapping({ parties: {}, banks: {} });
            }}
          />
          <Button
            disabled={!file || send.isPending}
            onClick={() => check({ parties: {}, banks: {} })}
          >
            <FileSpreadsheet /> {send.isPending ? 'Checking…' : 'Check workbook'}
          </Button>
        </div>
      </Card>

      {report && (
        <>
          {done ? (
            <Alert>
              <Check className="text-emerald-600" />
              <AlertDescription>
                Imported {report.created?.invoices} invoices ({report.created?.lines} lines),{' '}
                {report.created?.payments} payments and {report.created?.masters} master records.{' '}
                <Link href={dashboardLink(report)} className="underline">
                  Open the dashboard
                </Link>{' '}
                to compare with the Excel Dashboard.
              </AlertDescription>
            </Alert>
          ) : report.ready ? (
            <Alert>
              <Check className="text-emerald-600" />
              <AlertDescription>
                Ready to import. Review the figures below, then press Import.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>
                Not ready yet —{' '}
                {report.problems.length > 0 &&
                  `fix ${report.problems.length} problem(s) in the workbook`}
                {report.problems.length > 0 && !decided && ' and '}
                {!decided && 'decide every Sheet1 party name'}
                {decided && report.problems.length === 0 && 're-check with your choices'}.
              </AlertDescription>
            </Alert>
          )}

          {report.problems.length > 0 && (
            <Card title="Problems in the workbook" tone="warn">
              <ul className="grid gap-1 text-sm">
                {report.problems.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium">
                      {p.sheet}
                      {p.row ? ` row ${p.row}` : ''}:
                    </span>{' '}
                    {p.message}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Correct these in Excel, save, choose the file again and check.
              </p>
            </Card>
          )}

          <Card title="Excel Dashboard vs the app's recalculation">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Figure</TableHead>
                    <TableHead className="text-right">Excel</TableHead>
                    <TableHead className="text-right">App</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {report.comparison.map((c) => (
                    <TableRow key={c.metric}>
                      <TableCell className="font-sans">{c.metric}</TableCell>
                      <TableCell className="text-right">{figure(c.excel)}</TableCell>
                      <TableCell className="text-right">{figure(c.computed)}</TableCell>
                      <TableCell>
                        {c.matches ? (
                          <Check className="size-4 text-emerald-600" aria-label="matches" />
                        ) : (
                          <X className="size-4 text-destructive" aria-label="differs" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              {report.mismatches.length === 0
                ? 'Every line’s amount and commission recalculates exactly as in Excel.'
                : `${report.mismatches.length} line(s) recalculate differently — listed below.`}
            </p>
            {report.mismatches.length > 0 && (
              <ul className="grid gap-1 text-sm">
                {report.mismatches.map((m, i) => (
                  <li key={i}>
                    Invoice {m.invoiceNo} (Database row {m.row}) {m.product} — {m.field}: Excel{' '}
                    {m.excel}, app {m.computed}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="What will be imported">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Already in the app</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {(
                    [
                      ['Categories', report.summary.categories],
                      ['Products', report.summary.products],
                      ['Parties', report.summary.parties],
                      ['Sub-parties', report.summary.subParties],
                      ['Cities', report.summary.cities],
                      ['ASMs / salespersons', report.summary.salespersons],
                      ['Banks', report.summary.banks],
                    ] as const
                  ).map(([label, s]) => (
                    <TableRow key={label}>
                      <TableCell className="font-sans">{label}</TableCell>
                      <TableCell className="text-right">{s.create}</TableCell>
                      <TableCell className="text-right">{s.exists}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-sans">Invoices</TableCell>
                    <TableCell className="text-right">
                      {report.summary.invoices.create} ({report.summary.invoices.lines} lines)
                    </TableCell>
                    <TableCell className="text-right">{report.summary.invoices.exists}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-sans">Payments</TableCell>
                    <TableCell className="text-right">{report.summary.payments.create}</TableCell>
                    <TableCell className="text-right">{report.summary.payments.exists}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Payments: {report.summary.payments.duplicate} Sheet1 row(s) already on the Payments
              sheet are counted once; {report.summary.payments.skipped} skipped by your choice;{' '}
              {report.summary.payments.unmapped} waiting for a party decision.
            </p>
          </Card>

          {report.unmatchedParties.length > 0 && (
            <Card title={`2. Sheet1 party names (${report.unmatchedParties.length})`}>
              <p className="text-sm text-muted-foreground">
                These names in the bank log don&apos;t match a party. Choose the party each one is,
                create it as a new party, or leave its payments out. Suggestions are pre-filled —
                check them.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name in Sheet1</TableHead>
                      <TableHead className="text-right">Payments</TableHead>
                      <TableHead className="min-w-72">Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.unmatchedParties.map((u) => {
                      const m = mapping.parties[u.key];
                      const choice = m?.action ?? '';
                      return (
                        <TableRow key={u.key}>
                          <TableCell>{u.raw}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {u.payments} · {formatPKR(u.amount)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Select
                                value={choice}
                                onValueChange={(v) =>
                                  setParty(
                                    u.key,
                                    v === 'create'
                                      ? { action: 'create', name: u.raw }
                                      : v === 'skip'
                                        ? { action: 'skip' }
                                        : v === 'map'
                                          ? u.suggestion
                                            ? { action: 'map', party: u.suggestion }
                                            : undefined
                                          : undefined,
                                  )
                                }
                              >
                                <SelectTrigger
                                  className={cn('w-40', !m && 'border-destructive')}
                                  aria-label={`Decision for ${u.raw}`}
                                >
                                  <SelectValue placeholder="Choose…" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="map">Same as party…</SelectItem>
                                  <SelectItem value="create">New party</SelectItem>
                                  <SelectItem value="skip">Leave out</SelectItem>
                                </SelectContent>
                              </Select>
                              {(choice === 'map' || (!m && !u.suggestion)) && (
                                <div className="min-w-56 flex-1">
                                  <Combobox
                                    options={report.partyNames.map((n) => ({ value: n, label: n }))}
                                    value={m?.action === 'map' ? m.party : null}
                                    onChange={(v) =>
                                      setParty(u.key, v ? { action: 'map', party: v } : undefined)
                                    }
                                    placeholder="Pick the party"
                                  />
                                </div>
                              )}
                              {choice === 'create' && (
                                <Input
                                  className="min-w-56 flex-1"
                                  value={m?.action === 'create' ? m.name : ''}
                                  onChange={(e) =>
                                    setParty(u.key, { action: 'create', name: e.target.value })
                                  }
                                  aria-label="New party name"
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {report.banks.length > 0 && (
            <Card title="3. Sheet1 bank texts">
              <p className="text-sm text-muted-foreground">
                Sheet1 names your receiving accounts. Pick the bank each one is, or no bank — the
                original text is kept in the payment&apos;s remarks either way.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Text in Sheet1</TableHead>
                      <TableHead className="text-right">Payments</TableHead>
                      <TableHead className="min-w-56">Bank</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.banks.map((b) => (
                      <TableRow key={b.key}>
                        <TableCell>{b.raw}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.payments}</TableCell>
                        <TableCell>
                          <Combobox
                            options={[
                              { value: NO_BANK, label: 'No bank (keep text in remarks)' },
                              ...report.bankNames.map((n) => ({ value: n, label: n })),
                            ]}
                            value={mapping.banks[b.key] ?? NO_BANK}
                            onChange={(v) =>
                              setMapping((cur) => ({
                                ...cur,
                                banks: { ...cur.banks, [b.key]: !v || v === NO_BANK ? null : v },
                              }))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {!done && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" disabled={send.isPending || !file} onClick={() => check()}>
                {send.isPending ? 'Checking…' : 'Re-check with my choices'}
              </Button>
              <Button disabled={!canImport} onClick={() => setConfirming(true)}>
                Import
              </Button>
              {!upToDate && report.dryRun && (
                <span className="text-xs text-muted-foreground">
                  You changed some choices — re-check before importing.
                </span>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Import this workbook?"
        description={
          report &&
          `This adds ${report.summary.invoices.create} invoices, ${report.summary.payments.create} payments and the missing master records in one go. It's recorded in the audit log.`
        }
        confirmLabel="Import"
        busy={send.isPending}
        onConfirm={() => {
          setConfirming(false);
          send.mutate({ dryRun: false, map: mapping });
        }}
      />
    </div>
  );
}
