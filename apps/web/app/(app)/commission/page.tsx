'use client';

import {
  businessToday,
  type CommissionBasis,
  type CommissionRecalc,
  commissionRecalcSchema,
  commissionReportSchema,
  type CommissionRules,
  commissionRulesSchema,
  formatPKR,
  formatPKR2,
  monthRange,
  subPartyOptionSchema,
} from '@sms/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Percent, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Combobox } from '@/components/combobox';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormField } from '@/components/form-field';
import { FormSection, PageHeading } from '@/components/form-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  percentRateSchema,
  rateToPercent,
  toComboboxOptions,
  useMasterOptions,
} from '@/lib/masters';

const BASIS: Record<CommissionBasis, string> = {
  OVERRIDE: 'All sales',
  SHARE: 'Share',
  SALESMAN: 'Own sales',
};
const subPartyOptionsSchema = z.array(subPartyOptionSchema);

interface ShareRow {
  key: number;
  earnerId: string | null;
  matchPartySalespersonId: string | null;
  matchSubPartyId: string | null;
  percent: string;
}
let nextKey = 1;

/** Commission (docs/COMMISSION_SPEC.md): what each earner made, the rules, and recalculation. */
export default function CommissionPage() {
  const { can } = useAuth();
  const month = monthRange(businessToday().slice(0, 7));
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const report = useQuery({
    queryKey: ['commission', 'report', from, to],
    queryFn: () => api.get(`/commission/report?from=${from}&to=${to}`, commissionReportSchema),
  });
  const rules = useQuery({
    queryKey: ['commission', 'rules'],
    queryFn: () => api.get('/commission/rules', commissionRulesSchema),
  });

  return (
    <div className="grid max-w-5xl gap-5">
      <div>
        <PageHeading icon={Percent} tone="fuchsia">
          Commission
        </PageHeading>
        <p className="text-sm text-muted-foreground">
          Who earned what. Farhan-style rules: one salesman earns on all sales; shares come out of
          it.
        </p>
      </div>

      <FormSection title="Earned" icon={Calculator} tone="fuchsia" className="grid gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <FormField id="from" label="From">
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormField>
          <FormField id="to" label="To">
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormField>
        </div>
        {report.data && report.data.rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No commission in this period.</p>
        )}
        {report.data && report.data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-left text-muted-foreground [&>th]:px-2 [&>th]:py-1.5 [&>th]:font-medium">
                  <th>Salesman</th>
                  <th>For</th>
                  <th className="text-right">Lines</th>
                  <th className="text-right">On sales of</th>
                  <th className="text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {report.data.rows.map((r) => (
                  <tr
                    key={`${r.salesperson.id}-${r.basis}`}
                    className="border-b [&>td]:px-2 [&>td]:py-1.5"
                  >
                    <td className="font-medium">{r.salesperson.name}</td>
                    <td>{BASIS[r.basis]}</td>
                    <td className="text-right">{r.lines}</td>
                    <td className="text-right">{formatPKR(r.sales)}</td>
                    <td className="text-right font-semibold">{formatPKR2(r.commission)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold [&>td]:px-2 [&>td]:py-1.5">
                  <td colSpan={4} className="text-right">
                    Total
                  </td>
                  <td className="text-right">{formatPKR2(report.data.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </FormSection>

      {rules.data !== undefined && (
        <RulesEditor initial={rules.data} canEdit={can('settings.manage')} />
      )}
      {can('settings.manage') && <Recalculate />}
    </div>
  );
}

function RulesEditor({ initial, canEdit }: { initial: CommissionRules; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const salespersons = useMasterOptions('salespersons');
  const categories = useMasterOptions('categories');
  const subParties = useMasterOptions('sub-parties', subPartyOptionsSchema);
  const [overrider, setOverrider] = useState<string | null>(
    initial.overrider?.salespersonId ?? null,
  );
  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (initial.overrider?.rates ?? []).map((r) => [r.categoryId, rateToPercent(r.rate)]),
    ),
  );
  const [shares, setShares] = useState<ShareRow[]>(() =>
    initial.shares.map((s) => ({
      key: nextKey++,
      earnerId: s.earnerId,
      matchPartySalespersonId: s.matchPartySalespersonId,
      matchSubPartyId: s.matchSubPartyId,
      percent: rateToPercent(s.rate),
    })),
  );

  const save = useMutation({
    mutationFn: (body: unknown) => api.put('/commission/rules', commissionRulesSchema, body),
    onSuccess: (saved) => {
      queryClient.setQueryData(['commission', 'rules'], saved);
      toast.success('Rules saved. New invoices use them; recalculate to apply them to saved ones.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save.'),
  });

  const submit = () => {
    const pct = (v: string) => {
      const r = percentRateSchema.safeParse(v);
      return r.success ? r.data : undefined;
    };
    const rateRows = Object.entries(rates)
      .filter(([, v]) => v.trim() !== '')
      .map(([categoryId, v]) => ({ categoryId, rate: pct(v) }));
    const shareRows = shares
      .filter((s) => s.earnerId)
      .map((s) => ({
        earnerId: s.earnerId,
        matchPartySalespersonId: s.matchPartySalespersonId,
        matchSubPartyId: s.matchSubPartyId,
        rate: pct(s.percent),
      }));
    if ([...rateRows, ...shareRows].some((r) => !r.rate)) {
      return toast.error('Enter percentages like 0.35.');
    }
    save.mutate({
      overrider: overrider ? { salespersonId: overrider, rates: rateRows } : null,
      shares: shareRows,
    });
  };

  const people = toComboboxOptions(salespersons.data);
  const setShare = (key: number, patch: Partial<ShareRow>) =>
    setShares((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <FormSection title="Rules" icon={Percent} tone="fuchsia" className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:items-start">
        <FormField id="overrider" label="Earns on all sales">
          <Combobox
            id="overrider"
            options={people}
            value={overrider}
            onChange={setOverrider}
            noneLabel="Nobody (each invoice's salesman, usual rate)"
            placeholder="Nobody"
            disabled={!canEdit}
          />
        </FormField>
        {overrider && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(categories.data ?? []).map((c) => (
              <FormField key={c.id} id={`rate-${c.id}`} label={`${c.name} %`}>
                <Input
                  id={`rate-${c.id}`}
                  inputMode="decimal"
                  placeholder="usual"
                  value={rates[c.id] ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setRates((r) => ({ ...r, [c.id]: e.target.value }))}
                />
              </FormField>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Shares (taken out of the above)</p>
        {shares.length === 0 && <p className="text-sm text-muted-foreground">No shares.</p>}
        {shares.map((s) => (
          <div
            key={s.key}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_6rem_auto] sm:items-end"
          >
            <FormField id={`earner-${s.key}`} label="Who gets it">
              <Combobox
                id={`earner-${s.key}`}
                options={people}
                value={s.earnerId}
                onChange={(v) => setShare(s.key, { earnerId: v })}
                placeholder="Salesman…"
                disabled={!canEdit}
              />
            </FormField>
            <FormField id={`party-${s.key}`} label="On parties of">
              <Combobox
                id={`party-${s.key}`}
                options={people}
                value={s.matchPartySalespersonId}
                onChange={(v) => setShare(s.key, { matchPartySalespersonId: v })}
                noneLabel="—"
                placeholder="—"
                disabled={!canEdit}
              />
            </FormField>
            <FormField id={`sub-${s.key}`} label="Or through sub-party">
              <Combobox
                id={`sub-${s.key}`}
                options={toComboboxOptions(subParties.data)}
                value={s.matchSubPartyId}
                onChange={(v) => setShare(s.key, { matchSubPartyId: v })}
                noneLabel="—"
                placeholder="—"
                disabled={!canEdit}
              />
            </FormField>
            <FormField id={`pct-${s.key}`} label="%">
              <Input
                id={`pct-${s.key}`}
                inputMode="decimal"
                value={s.percent}
                disabled={!canEdit}
                onChange={(e) => setShare(s.key, { percent: e.target.value })}
              />
            </FormField>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove share"
                onClick={() => setShares((rs) => rs.filter((r) => r.key !== s.key))}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setShares((rs) => [
                  ...rs,
                  {
                    key: nextKey++,
                    earnerId: null,
                    matchPartySalespersonId: null,
                    matchSubPartyId: null,
                    percent: '0.15',
                  },
                ])
              }
            >
              <Plus /> Add share
            </Button>
          </div>
        )}
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={submit} disabled={save.isPending}>
            <Save /> {save.isPending ? 'Saving…' : 'Save rules'}
          </Button>
        </div>
      )}
    </FormSection>
  );
}

function Recalculate() {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<CommissionRecalc | null>(null);
  const [confirming, setConfirming] = useState(false);
  const run = useMutation({
    mutationFn: (dryRun: boolean) =>
      api.post(`/commission/recalculate?dryRun=${dryRun}`, commissionRecalcSchema),
    onSuccess: (r) => {
      setResult(r);
      setConfirming(false);
      if (!r.dryRun) {
        toast.success(`Recalculated: ${r.changedLines} line(s) changed.`);
        void queryClient.invalidateQueries();
      }
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not recalculate.'),
  });
  return (
    <FormSection
      title="Recalculate all invoices"
      icon={RefreshCw}
      tone="amber"
      className="grid gap-3"
    >
      <p className="-mt-1 text-sm text-muted-foreground">
        Applies today&apos;s rules to every saved invoice. Only commission changes, never amounts.
        Check first: nothing is saved until you apply.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate(true)}>
          Check (no changes)
        </Button>
        <Button
          disabled={run.isPending || !result?.dryRun || result.changedLines === 0}
          onClick={() => setConfirming(true)}
        >
          Apply to all invoices
        </Button>
      </div>
      {result && (
        <div className="grid gap-2 text-sm">
          <p>
            {result.dryRun ? 'Would change' : 'Changed'} <b>{result.changedLines}</b> of{' '}
            {result.lines} lines on {result.invoices} invoices. Total commission{' '}
            {formatPKR2(result.totalBefore)} → <b>{formatPKR2(result.totalAfter)}</b>.
          </p>
          <table className="w-full tabular-nums">
            <thead>
              <tr className="border-b text-left text-muted-foreground [&>th]:px-2 [&>th]:py-1 [&>th]:font-medium">
                <th>Salesman</th>
                <th className="text-right">Before</th>
                <th className="text-right">After</th>
              </tr>
            </thead>
            <tbody>
              {result.earners.map((e) => (
                <tr key={e.salesperson.id} className="border-b [&>td]:px-2 [&>td]:py-1">
                  <td>{e.salesperson.name}</td>
                  <td className="text-right">{formatPKR2(e.before)}</td>
                  <td className="text-right font-medium">{formatPKR2(e.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Recalculate commission on every invoice?"
        description={`${result?.changedLines ?? 0} line(s) change. Past commission figures and reports change with them. This is recorded in the audit log.`}
        confirmLabel="Apply"
        busy={run.isPending}
        onConfirm={() => run.mutate(false)}
      />
    </FormSection>
  );
}
