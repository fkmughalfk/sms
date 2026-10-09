'use client';

import {
  businessToday,
  formatCommission,
  formatKg,
  formatNumber,
  formatPKR,
  formatQty,
  formatTons,
  type InvoiceDetail,
  invoiceConflictSchema,
  invoiceDetailSchema,
  invoiceInputSchema,
  nextInvoiceNoSchema,
  partyOptionSchema,
  type ProductOption,
  productOptionSchema,
  subPartyOptionSchema,
} from '@sms/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Combobox } from '@/components/combobox';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormField } from '@/components/form-field';
import { PartyDialog } from '@/components/master/party-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  blankLine,
  calcDraft,
  type DraftLine,
  draftFromDetail,
  duplicateProductIds,
} from '@/lib/invoices';
import { masterKey, toComboboxOptions, useMasterOptions } from '@/lib/masters';
import { cn } from '@/lib/utils';

interface FormValues {
  invoiceNo: string;
  invoiceDate: string;
  partyId: string | null;
  cityId: string | null;
  subPartyId: string | null;
  salespersonId: string | null;
  remarks: string;
  lines: DraftLine[];
}

const START_ROWS = 5;

const emptyValues = (invoiceNo = ''): FormValues => ({
  invoiceNo,
  invoiceDate: businessToday(),
  partyId: null,
  cityId: null,
  subPartyId: null,
  salespersonId: null,
  remarks: '',
  lines: Array.from({ length: START_ROWS }, blankLine),
});

const productOptionsSchema = z.array(productOptionSchema);
const partyOptionsSchema = z.array(partyOptionSchema);
const subPartyOptionsSchema = z.array(subPartyOptionSchema);

/**
 * The invoice entry grid (spec §5.2, replaces the Excel "Data Entry" sheet).
 * Totals are previewed live with the shared calc; the API recomputes on save.
 */
export function InvoiceForm({ detail }: { detail?: InvoiceDetail }) {
  const isEdit = detail !== undefined;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const products = useMasterOptions('products', productOptionsSchema);
  const parties = useMasterOptions('parties', partyOptionsSchema);
  const cities = useMasterOptions('cities');
  const salespersons = useMasterOptions('salespersons');
  const nextNo = useQuery({
    queryKey: ['invoices', 'next-number'],
    queryFn: () => api.get('/invoices/next-number', nextInvoiceNoSchema),
    enabled: !isEdit,
  });

  const form = useForm<FormValues>({
    defaultValues: detail ? withSpareRow(draftFromDetail(detail)) : emptyValues(),
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const lines = useWatch({ control: form.control, name: 'lines' });
  const partyId = useWatch({ control: form.control, name: 'partyId' });
  const subParties = useMasterOptions(
    'sub-parties',
    subPartyOptionsSchema,
    partyId ? `?partyId=${partyId}` : '',
  );

  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [conflict, setConflict] = useState<{ no: number; id: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [addingParty, setAddingParty] = useState(false);
  const saveAndNew = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Suggest the next number on a fresh form (editable — spec §4.1).
  useEffect(() => {
    if (!isEdit && nextNo.data && !form.getFieldState('invoiceNo').isDirty) {
      form.setValue('invoiceNo', String(nextNo.data.invoiceNo));
    }
  }, [isEdit, nextNo.data, form]);

  // Products for lookups: active options plus any (now inactive) product already on the invoice.
  const productMap = useMemo(() => {
    const map = new Map<string, ProductOption>((products.data ?? []).map((p) => [p.id, p]));
    for (const l of detail?.lines ?? []) {
      if (!map.has(l.product.id)) {
        map.set(l.product.id, {
          ...l.product,
          packWeightKg: l.packWeightKg,
          effectiveCommissionRate: l.commissionRate,
          categoryId: '',
        });
      }
    }
    return map;
  }, [products.data, detail]);

  const productOptions = useMemo(
    () =>
      [...productMap.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({
          value: p.id,
          label: p.name,
          hint: `#${p.sku}`,
        })),
    [productMap],
  );

  const draft = calcDraft(lines, productMap, detail?.lines);
  const dupes = duplicateProductIds(lines);
  const isDirty = form.formState.isDirty;

  // Unsaved-changes warning (spec §8).
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const save = useMutation({
    mutationFn: (body: unknown) =>
      isEdit
        ? api.put(`/invoices/${detail.id}`, invoiceDetailSchema, body)
        : api.post('/invoices', invoiceDetailSchema, body),
    onSuccess: (saved) => {
      toast.success(`Invoice ${saved.invoiceNo} saved — ${formatPKR(saved.totalAmount)} PKR.`);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (saveAndNew.current && !isEdit) {
        form.reset(emptyValues());
        setErrors(new Map());
        void nextNo.refetch();
      } else {
        form.reset(form.getValues()); // clear dirty flag before navigating
        router.push(`/invoices/${saved.id}`);
      }
    },
    onError: (e) => {
      if (!(e instanceof ApiError)) return toast.error('Could not reach the server.');
      const c = invoiceConflictSchema.safeParse(e.body);
      if (c.success && c.data.invoiceId) {
        setConflict({ no: Number(form.getValues('invoiceNo')), id: c.data.invoiceId });
      } else if (e.errors?.length) {
        setErrors(new Map(e.errors.map((x) => [x.path, x.message])));
        toast.error(e.message);
      } else {
        setErrors(new Map([['invoiceNo', e.message]]));
        toast.error(e.message);
      }
    },
  });

  const submit = (andNew: boolean) => {
    saveAndNew.current = andNew;
    const values = form.getValues();
    const parsed = invoiceInputSchema.safeParse(values);
    if (!parsed.success) {
      const map = new Map(parsed.error.issues.map((i) => [i.path.join('.') || 'lines', i.message]));
      setErrors(map);
      toast.error([...map.values()].slice(0, 4).join('\n'));
      return;
    }
    setErrors(new Map());
    save.mutate(values);
  };

  const onPartyChange = (id: string | null) => {
    form.setValue('partyId', id, { shouldDirty: true });
    form.setValue('subPartyId', null, { shouldDirty: true });
    const party = parties.data?.find((p) => p.id === id);
    if (party?.cityId) form.setValue('cityId', party.cityId, { shouldDirty: true });
  };

  /** Enter moves to the next cell; from the last cell it adds a row (spec §5.2). */
  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (e.key !== 'Enter' || target.tagName !== 'INPUT') return;
    e.preventDefault();
    const cells = [...(gridRef.current?.querySelectorAll<HTMLElement>('[data-cell]') ?? [])];
    const next = cells[cells.indexOf(target) + 1];
    if (next) return next.focus();
    append(blankLine());
    setTimeout(() => {
      const all = gridRef.current?.querySelectorAll<HTMLElement>('[data-cell]');
      all?.[all.length - 3]?.focus();
    });
  };

  const err = (path: string) => errors.get(path);
  const totals = draft.totals;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
      <div className="grid min-w-0 gap-4">
        {/* Header (Excel D4:D9) */}
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-3">
          <FormField id="invoiceNo" label="Invoice No." error={err('invoiceNo')}>
            <Input
              id="invoiceNo"
              inputMode="numeric"
              aria-invalid={!!err('invoiceNo')}
              {...form.register('invoiceNo')}
            />
          </FormField>
          <FormField id="invoiceDate" label="Invoice Date" error={err('invoiceDate')}>
            <Input
              id="invoiceDate"
              type="date"
              aria-invalid={!!err('invoiceDate')}
              {...form.register('invoiceDate')}
            />
          </FormField>
          <FormField id="partyId" label="Party (Name)" error={err('partyId')}>
            <div className="flex gap-2">
              <Combobox
                id="partyId"
                options={toComboboxOptions(parties.data, detail?.party)}
                value={partyId}
                onChange={onPartyChange}
                placeholder="Select party"
                aria-invalid={!!err('partyId')}
              />
              {can('masters.manage') && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setAddingParty(true)}
                  aria-label="Add party"
                  title="Add party"
                >
                  <Plus />
                </Button>
              )}
            </div>
          </FormField>
          <FormField id="cityId" label="City" error={err('cityId')}>
            <Controller
              control={form.control}
              name="cityId"
              render={({ field }) => (
                <Combobox
                  id="cityId"
                  options={toComboboxOptions(cities.data, detail?.city)}
                  value={field.value}
                  onChange={field.onChange}
                  noneLabel="—"
                  placeholder="—"
                />
              )}
            />
          </FormField>
          <FormField id="subPartyId" label="Sub Party" error={err('subPartyId')}>
            <Controller
              control={form.control}
              name="subPartyId"
              render={({ field }) => (
                <Combobox
                  id="subPartyId"
                  options={toComboboxOptions(subParties.data, detail?.subParty)}
                  value={field.value}
                  onChange={field.onChange}
                  noneLabel="—"
                  placeholder="—"
                />
              )}
            />
          </FormField>
          <FormField id="salespersonId" label="ASM / Salesperson" error={err('salespersonId')}>
            <Controller
              control={form.control}
              name="salespersonId"
              render={({ field }) => (
                <Combobox
                  id="salespersonId"
                  options={toComboboxOptions(salespersons.data, detail?.salesperson)}
                  value={field.value}
                  onChange={field.onChange}
                  noneLabel="—"
                  placeholder="—"
                />
              )}
            />
          </FormField>
          <div className="sm:col-span-2 xl:col-span-3">
            <FormField id="remarks" label="Remarks" error={err('remarks')}>
              <Input id="remarks" autoComplete="off" {...form.register('remarks')} />
            </FormField>
          </div>
        </div>

        {err('lines') && (
          <Alert variant="destructive">
            <AlertDescription>{err('lines')}</AlertDescription>
          </Alert>
        )}

        {/* Line items */}
        <div ref={gridRef} onKeyDown={onGridKeyDown} className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:font-medium">
                <th className="w-10 text-left">Sr</th>
                <th className="text-left">Description (Product)</th>
                <th className="w-20 text-right">Bags</th>
                <th className="w-20 text-right">Pack Wt</th>
                <th className="w-28 text-right">Rate 40Kg</th>
                <th className="w-24 text-right">Rate/Pack</th>
                <th className="w-28 text-right">Amount</th>
                <th className="w-24 text-right">Commission</th>
                <th className="w-24 text-right">Weight (KG)</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, i) => {
                const line = lines[i];
                const calc = draft.lines[i];
                const product = line?.productId ? productMap.get(line.productId) : undefined;
                const dupe = !!line?.productId && dupes.has(line.productId);
                return (
                  <tr key={field.id} className="border-t [&>td]:px-2 [&>td]:py-1">
                    <td className="text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="min-w-64">
                      <Controller
                        control={form.control}
                        name={`lines.${i}.productId`}
                        render={({ field: f }) => (
                          <Combobox
                            options={productOptions}
                            value={f.value}
                            onChange={f.onChange}
                            placeholder="Select product"
                            noneLabel="(clear)"
                            className={cn('h-8', dupe && 'border-amber-500')}
                            aria-invalid={!!err(`lines.${i}.productId`)}
                            triggerProps={{ 'data-cell': '' }}
                            afterSelect={() => document.getElementById(`qty-${i}`)?.focus()}
                          />
                        )}
                      />
                    </td>
                    <td>
                      <Input
                        id={`qty-${i}`}
                        data-cell=""
                        inputMode="numeric"
                        className="h-8 text-right tabular-nums"
                        aria-invalid={!!err(`lines.${i}.qtyPacks`)}
                        {...form.register(`lines.${i}.qtyPacks`)}
                      />
                    </td>
                    <td className="text-right text-muted-foreground tabular-nums">
                      {calc
                        ? formatKg(calc.packWeightKg)
                        : product
                          ? formatKg(product.packWeightKg)
                          : ''}
                    </td>
                    <td>
                      <Input
                        data-cell=""
                        inputMode="decimal"
                        className="h-8 text-right tabular-nums"
                        aria-invalid={!!err(`lines.${i}.rate40Kg`)}
                        {...form.register(`lines.${i}.rate40Kg`)}
                      />
                    </td>
                    <td className="text-right tabular-nums">
                      {calc ? formatNumber(calc.ratePerPack, 2) : ''}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {calc ? formatPKR(calc.amount) : ''}
                    </td>
                    <td className="text-right tabular-nums">
                      {calc ? formatCommission(calc.commission) : ''}
                    </td>
                    <td className="text-right tabular-nums">
                      {calc ? formatKg(calc.weightKg) : ''}
                    </td>
                    <td>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        tabIndex={-1}
                        aria-label={`Remove line ${i + 1}`}
                        onClick={() =>
                          fields.length > 1 ? remove(i) : form.setValue(`lines.0`, blankLine())
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => append(blankLine())}>
            <Plus /> Add row
          </Button>
          {dupes.size > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4" /> The same product appears on more than one line.
            </p>
          )}
        </div>
      </div>

      {/* Summary panel (Excel I5:I7) */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="grid gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Invoice summary</h2>
          <dl className="grid gap-2 text-sm [&>div]:flex [&>div]:justify-between [&_dd]:font-medium [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
            <div>
              <dt>Amount</dt>
              <dd className="text-base">{formatPKR(totals.totalAmount)}</dd>
            </div>
            <div>
              <dt>Commission</dt>
              <dd>{formatCommission(totals.totalCommission)}</dd>
            </div>
            <div>
              <dt>Total bags</dt>
              <dd>{formatQty(totals.totalPacks)}</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>
                {formatKg(totals.totalWeightKg)} KG · {formatTons(totals.totalWeightKg)} t
              </dd>
            </div>
          </dl>
          <div className="grid gap-2 pt-2">
            <Button type="button" onClick={() => submit(false)} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Save'}
            </Button>
            {!isEdit && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => submit(true)}
                disabled={save.isPending}
              >
                Save & new
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => (isDirty ? setConfirmClear(true) : undefined)}
              disabled={!isDirty}
            >
              {isEdit ? 'Discard changes' : 'Clear'}
            </Button>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={conflict !== null}
        onOpenChange={(o) => !o && setConflict(null)}
        title={`Invoice ${conflict?.no} already exists`}
        description="Open it for edit instead? Nothing has been saved."
        confirmLabel="Open for edit"
        onConfirm={() => {
          form.reset(form.getValues());
          router.push(`/invoices/${conflict?.id}/edit`);
        }}
      />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={isEdit ? 'Discard changes?' : 'Clear the form?'}
        description="Everything you typed will be lost."
        confirmLabel={isEdit ? 'Discard' : 'Clear'}
        destructive
        onConfirm={() => {
          form.reset(
            isEdit
              ? withSpareRow(draftFromDetail(detail))
              : emptyValues(nextNo.data ? String(nextNo.data.invoiceNo) : ''),
          );
          setErrors(new Map());
          setConfirmClear(false);
        }}
      />
      {addingParty && (
        <PartyDialog
          row={null}
          open={addingParty}
          onOpenChange={setAddingParty}
          onSaved={(p) => {
            void queryClient.invalidateQueries({ queryKey: masterKey('parties') });
            onPartyChange(p.id);
            if (p.cityId) form.setValue('cityId', p.cityId, { shouldDirty: true });
          }}
        />
      )}
    </div>
  );
}

/** Saved invoices open with one empty row ready for typing. */
function withSpareRow(values: ReturnType<typeof draftFromDetail>): FormValues {
  return { ...values, lines: [...values.lines, blankLine()] };
}
