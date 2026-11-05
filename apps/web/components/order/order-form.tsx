'use client';

import {
  businessToday,
  discountUnit,
  formatNumber,
  formatPKR,
  type OrderDetail,
  orderDetailSchema,
  orderInputSchema,
  partyOptionSchema,
  subPartyOptionSchema,
} from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Percent, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Combobox, type ComboboxOption } from '@/components/combobox';
import { FormField } from '@/components/form-field';
import { FormSection } from '@/components/form-section';
import { CreditWarning } from '@/components/invoice/credit-warning';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';
import {
  lineKey,
  type LinePricing,
  ORDERS_KEY,
  packWord,
  previewLine,
  previewTotals,
} from '@/lib/orders';
import { BASIS_LABEL, formatRate, shortCropYear, useCurrentRateList } from '@/lib/rate-lists';

interface Row {
  key: number;
  /** `productId|cropYear` of the picked rate-list line. */
  item: string | null;
  qty: string;
  /** Office only: a rate other than the list's. */
  rate: string;
}

interface Item extends LinePricing {
  productId: string;
  cropYear: string | null;
  name: string;
  category: string;
  /** True for a line already booked on this order (its booked rate stays). */
  booked: boolean;
}

let nextKey = 1;
const blankRow = (): Row => ({ key: nextKey++, item: null, qty: '', rate: '' });

const partyOptionsSchema = z.array(partyOptionSchema);
const subPartyOptionsSchema = z.array(subPartyOptionSchema);

/**
 * Book or edit an order. Products come from the current rate list (product + crop year)
 * at the list's rate; lines already booked keep their rate. The office may change rates.
 */
export function OrderForm({ existing }: { existing?: OrderDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const manage = can('order.manage');

  const current = useCurrentRateList();
  const parties = useMasterOptions('parties', partyOptionsSchema);
  const cities = useMasterOptions('cities');
  const salespersons = useMasterOptions('salespersons');
  const categories = useMasterOptions('categories');

  const [orderDate, setOrderDate] = useState(existing?.orderDate ?? businessToday());
  const [partyId, setPartyId] = useState<string | null>(existing?.party.id ?? null);
  const [subPartyId, setSubPartyId] = useState<string | null>(existing?.subParty?.id ?? null);
  const [cityId, setCityId] = useState<string | null>(existing?.city?.id ?? null);
  const [salespersonId, setSalespersonId] = useState<string | null>(
    existing?.salesperson?.id ?? null,
  );
  const [remarks, setRemarks] = useState(existing?.remarks ?? '');
  const [rows, setRows] = useState<Row[]>(() =>
    existing
      ? existing.lines.map((l) => ({
          key: nextKey++,
          item: lineKey(l.product.id, l.cropYear),
          qty: String(l.qtyPacks),
          rate: '',
        }))
      : [blankRow()],
  );
  const [discounts, setDiscounts] = useState<Record<string, string>>(() =>
    Object.fromEntries((existing?.discounts ?? []).map((d) => [d.category.id, d.amount])),
  );
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  const subParties = useMasterOptions(
    'sub-parties',
    subPartyOptionsSchema,
    partyId ? `?partyId=${partyId}` : '',
  );

  /** Everything that can go on a line: lines already booked, then the current list. */
  const items = useMemo(() => {
    const m = new Map<string, Item>();
    for (const l of existing?.lines ?? []) {
      m.set(lineKey(l.product.id, l.cropYear), {
        productId: l.product.id,
        cropYear: l.cropYear,
        name: l.product.name,
        category: l.product.category.name,
        basis: l.basis,
        rate: l.rate,
        packWeightKg: l.packWeightKg,
        packPcs: l.packPcs,
        booked: true,
      });
    }
    for (const l of current.data?.items ?? []) {
      const k = lineKey(l.productId, l.cropYear);
      if (m.has(k) || !l.isAvailable || !l.rate) continue;
      m.set(k, {
        productId: l.productId,
        cropYear: l.cropYear,
        name: l.product.name,
        category: l.product.category,
        basis: l.basis,
        rate: l.rate,
        packWeightKg: l.product.packWeightKg,
        packPcs: l.product.packPcs,
        booked: false,
      });
    }
    return m;
  }, [existing, current.data]);

  const itemOptions: ComboboxOption[] = [...items.entries()].map(([k, it]) => ({
    value: k,
    label: `${it.name}${it.cropYear ? ` · ${shortCropYear(it.cropYear)}` : ''}`,
    hint: `${formatRate(it.rate)} ${BASIS_LABEL[it.basis]}${it.booked ? ' · booked' : ''}`,
  }));

  const previews = rows.map((r) =>
    previewLine(r.item ? (items.get(r.item) ?? null) : null, r.qty, manage ? r.rate : ''),
  );
  const totals = previewTotals(
    previews,
    rows.map((r) => Number(r.qty) || 0),
  );

  /** Categories on the order, for the prompt-payment discount. */
  const orderCategories = useMemo(() => {
    const names = new Set(
      rows.map((r) => (r.item ? items.get(r.item)?.category : undefined)).filter(Boolean),
    );
    for (const d of existing?.discounts ?? []) names.add(d.category.name);
    return (categories.data ?? []).filter((c) => names.has(c.name));
  }, [rows, items, categories.data, existing]);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const onPartyChange = (id: string | null) => {
    setPartyId(id);
    setSubPartyId(null);
    const party = parties.data?.find((p) => p.id === id);
    if (party?.cityId) setCityId(party.cityId);
    if (party?.salespersonId) setSalespersonId(party.salespersonId);
  };

  const filled = rows.filter((r) => r.item);
  const body = () => ({
    orderDate,
    partyId: partyId ?? '',
    subPartyId,
    cityId,
    salespersonId,
    remarks,
    lines: filled.map((r) => {
      const it = items.get(r.item!)!;
      return {
        productId: it.productId,
        cropYear: it.cropYear,
        qtyPacks: r.qty,
        ...(manage && r.rate.trim() ? { rate: r.rate.trim() } : {}),
      };
    }),
    discounts: orderCategories
      .filter((c) => (discounts[c.id] ?? '').trim() !== '')
      .map((c) => ({ categoryId: c.id, amount: discounts[c.id]!.trim() })),
  });

  const save = useMutation({
    mutationFn: (b: unknown) =>
      existing
        ? api.put(`/orders/${existing.id}`, orderDetailSchema, b)
        : api.post('/orders', orderDetailSchema, b),
    onSuccess: (saved) => {
      toast.success(
        existing
          ? `Order ${saved.orderNo} saved.`
          : saved.status === 'SUBMITTED'
            ? `Order ${saved.orderNo} sent to the office for approval.`
            : `Order ${saved.orderNo} booked.`,
      );
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      router.push(`/orders/${saved.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.errors?.length) {
        setErrors(new Map(e.errors.map((x) => [x.path, x.message])));
      }
      toast.error(e instanceof ApiError ? e.message : 'Could not save.');
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const b = body();
    const parsed = orderInputSchema.safeParse(b);
    const map = new Map<string, string>();
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const path = i.path.join('.');
        if (!map.has(path)) map.set(path, i.message);
      }
    }
    filled.forEach((r, i) => {
      if (
        !previewLine(items.get(r.item!) ?? null, r.qty, manage ? r.rate : '') &&
        !map.has(`lines.${i}.qtyPacks`)
      ) {
        map.set(`lines.${i}.qtyPacks`, 'Enter whole bags / cartons.');
      }
    });
    setErrors(map);
    if (map.size) {
      toast.error(map.values().next().value ?? 'Please check the order.');
      return;
    }
    save.mutate(b);
  };

  /** Error for a row: lines are numbered among the filled rows. */
  const rowError = (r: Row) => {
    const i = filled.indexOf(r);
    if (i === -1) return undefined;
    return ['productId', 'qtyPacks', 'rate', 'cropYear']
      .map((f) => errors.get(`lines.${i}.${f}`))
      .find(Boolean);
  };

  if (current.isPending) return <p className="text-sm text-muted-foreground">Loading rates…</p>;
  if (current.data === null && !existing) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        No rate list is in effect yet, so orders can&apos;t be booked. The office publishes one
        under Rate Lists.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 pb-24" noValidate>
      <FormSection title="Party" icon={ClipboardList} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField id="partyId" label="Party" error={errors.get('partyId')}>
            <Combobox
              id="partyId"
              options={toComboboxOptions(parties.data, existing?.party)}
              value={partyId}
              onChange={onPartyChange}
              placeholder="Select party…"
              aria-invalid={!!errors.get('partyId')}
            />
          </FormField>
          <FormField id="subPartyId" label="Sub party (optional)" error={errors.get('subPartyId')}>
            <Combobox
              id="subPartyId"
              options={toComboboxOptions(subParties.data, existing?.subParty)}
              value={subPartyId}
              onChange={setSubPartyId}
              noneLabel="No sub party"
              placeholder="None"
              disabled={!partyId}
            />
          </FormField>
          <FormField id="orderDate" label="Order date" error={errors.get('orderDate')}>
            <Input
              id="orderDate"
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
            />
          </FormField>
          <FormField id="cityId" label="City" error={errors.get('cityId')}>
            <Combobox
              id="cityId"
              options={toComboboxOptions(cities.data, existing?.city)}
              value={cityId}
              onChange={setCityId}
              noneLabel="No city"
              placeholder="None"
            />
          </FormField>
          <FormField id="salespersonId" label="Salesman" error={errors.get('salespersonId')}>
            <Combobox
              id="salespersonId"
              options={toComboboxOptions(salespersons.data, existing?.salesperson)}
              value={salespersonId}
              onChange={setSalespersonId}
              noneLabel="No salesman"
              placeholder="None"
            />
          </FormField>
          <FormField id="remarks" label="Remarks" error={errors.get('remarks')}>
            <Input id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </FormField>
        </div>
        <CreditWarning partyId={partyId} invoiceTotal={totals.totalAmount.toString()} />
      </FormSection>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
          <h2 className="text-sm font-semibold">Products</h2>
          <p className="text-xs text-muted-foreground">
            Rates from the current list{manage ? '; the office may change a rate' : ''}
          </p>
        </div>
        {errors.get('lines') && (
          <p className="px-4 pt-3 text-sm text-destructive">{errors.get('lines')}</p>
        )}
        <ul className="divide-y">
          {rows.map((r, n) => {
            const it = r.item ? items.get(r.item) : undefined;
            const p = previews[n];
            const err = rowError(r);
            return (
              <li key={r.key} className="grid gap-2 px-4 py-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_auto] sm:items-start">
                  <Combobox
                    options={itemOptions}
                    value={r.item}
                    onChange={(v) => update(r.key, { item: v, rate: '' })}
                    placeholder="Select product…"
                    aria-invalid={!!err}
                  />
                  <div className="flex items-start gap-2 sm:contents">
                    <Input
                      aria-label="Quantity"
                      inputMode="numeric"
                      placeholder={it && it.packPcs > 1 ? 'Cartons' : 'Bags'}
                      value={r.qty}
                      className="flex-1 text-right tabular-nums sm:flex-none"
                      onChange={(e) => update(r.key, { qty: e.target.value.replace(/[^\d]/g, '') })}
                    />
                    {manage ? (
                      <Input
                        aria-label="Rate"
                        inputMode="decimal"
                        placeholder={it ? formatRate(it.rate) : 'Rate'}
                        value={r.rate}
                        className="flex-1 text-right tabular-nums sm:flex-none"
                        onChange={(e) => update(r.key, { rate: e.target.value.replace(/,/g, '') })}
                      />
                    ) : (
                      <p className="hidden h-9 items-center justify-end text-sm tabular-nums sm:flex">
                        {it ? formatRate(it.rate) : ''}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove line"
                      className="shrink-0 justify-self-end"
                      onClick={() =>
                        setRows((rs) =>
                          rs.length === 1 ? [blankRow()] : rs.filter((x) => x.key !== r.key),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {it && (
                  <p className="text-xs text-muted-foreground">
                    {formatRate(manage && r.rate ? r.rate : it.rate)} {BASIS_LABEL[it.basis]}
                    {it.packPcs > 1 && ` · carton of ${it.packPcs}`}
                    {it.booked && ' · booked rate'}
                    {p && (
                      <>
                        {' · '}
                        {formatNumber(p.weightKg.toString(), 0)} kg ·{' '}
                        <span className="font-medium text-foreground">
                          Rs {formatPKR(p.amount.toString())}
                        </span>
                      </>
                    )}
                  </p>
                )}
                {err && <p className="text-sm text-destructive">{err}</p>}
              </li>
            );
          })}
        </ul>
        <div className="border-t px-4 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRows((rs) => [...rs, blankRow()])}
          >
            <Plus /> Add product
          </Button>
        </div>
      </section>

      {orderCategories.length > 0 && (
        <FormSection
          title="Prompt-payment discount"
          icon={Percent}
          tone="emerald"
          className="grid gap-3"
        >
          <p className="-mt-1 text-xs text-muted-foreground">
            Credited to the party&apos;s ledger if it pays within its credit days. Leave blank for
            none.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {orderCategories.map((c) => (
              <FormField
                key={c.id}
                id={`discount-${c.id}`}
                label={`${c.name} (Rs ${discountUnit(c.name) === 'PER_40KG' ? 'per 40 kg' : 'per kg'})`}
              >
                <Input
                  id={`discount-${c.id}`}
                  inputMode="decimal"
                  placeholder="0"
                  value={discounts[c.id] ?? ''}
                  onChange={(e) => setDiscounts((d) => ({ ...d, [c.id]: e.target.value }))}
                />
              </FormField>
            ))}
          </div>
        </FormSection>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-[96rem] items-center gap-3 px-1 md:px-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold tabular-nums">
              Rs {formatPKR(totals.totalAmount.toString())}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {totals.totalPacks} {packWord(1, totals.totalPacks)} / cartons ·{' '}
              {formatNumber(totals.totalWeightKg.toString(), 0)} kg
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            <Save />{' '}
            {save.isPending ? 'Saving…' : existing ? 'Save' : manage ? 'Book order' : 'Send order'}
          </Button>
        </div>
      </div>
    </form>
  );
}
