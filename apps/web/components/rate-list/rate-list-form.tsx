'use client';

import {
  formatPKR2,
  packRate,
  type RateBasis,
  type RateListDetail,
  type RateListLine,
  rateListDetailSchema,
  rateListInputSchema,
  rateListUploadResultSchema,
  toBusinessDateTime,
} from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Download, Plus, Save, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { FormSection } from '@/components/form-section';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { formatRate, groupByCategory, RATE_LISTS_KEY, rateChange } from '@/lib/rate-lists';
import { cn } from '@/lib/utils';
import { packLabel } from './rate-list-lines';

interface Row {
  key: number;
  product: RateListLine['product'];
  cropYear: string;
  basis: RateBasis;
  rate: string;
  isAvailable: boolean;
  note: string;
  previousRate: string | null;
}

let nextKey = 1;
const toRow = (l: RateListLine): Row => ({
  key: nextKey++,
  product: l.product,
  cropYear: l.cropYear ? l.cropYear.replace(/^20(\d\d)-20(\d\d)$/, '$1-$2') : '',
  basis: l.basis,
  rate: l.rate ?? '',
  isAvailable: l.isAvailable,
  note: l.note ?? '',
  previousRate: l.previousRate,
});

const RATE_RE = /^\d+(\.\d{1,2})?$/;

/** Now in Karachi, to the minute — the default start for a new list. */
const nowLocal = () => toBusinessDateTime(new Date());

/**
 * Create or edit a rate list. Every product is listed; the office types the rates that
 * changed, marks anything not on sale as N/A, and can add a line for a second crop year.
 */
export function RateListForm({
  initial,
  lines,
  existingId,
  copiedFrom,
}: {
  initial?: Pick<RateListDetail, 'effectiveFrom' | 'remarks'>;
  lines: RateListLine[];
  existingId?: string;
  copiedFrom?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? nowLocal());
  const [remarks, setRemarks] = useState(initial?.remarks ?? '');
  const [rows, setRows] = useState<Row[]>(() => lines.map(toRow));
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [problems, setProblems] = useState<{ row: number; message: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addCropYear = (row: Row) =>
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === row.key);
      const copy: Row = {
        ...row,
        key: nextKey++,
        cropYear: '',
        rate: '',
        note: '',
        previousRate: null,
        isAvailable: true,
      };
      return [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)];
    });
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  const indexed = useMemo(() => rows.map((r, index) => ({ ...r, index })), [rows]);
  const countByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.product.id, (m.get(r.product.id) ?? 0) + 1);
    return m;
  }, [rows]);
  const onSale = rows.filter((r) => r.isAvailable).length;

  const body = () => ({
    effectiveFrom,
    remarks,
    items: rows.map((r) => ({
      productId: r.product.id,
      cropYear: r.cropYear,
      basis: r.basis,
      rate: r.isAvailable ? r.rate : r.rate || null,
      isAvailable: r.isAvailable,
      note: r.note,
    })),
  });

  const save = useMutation({
    mutationFn: (b: unknown) =>
      existingId
        ? api.put(`/rate-lists/${existingId}`, rateListDetailSchema, b)
        : api.post('/rate-lists', rateListDetailSchema, b),
    onSuccess: (saved) => {
      toast.success(existingId ? 'Rate list saved.' : 'Rate list published.');
      void queryClient.invalidateQueries({ queryKey: RATE_LISTS_KEY });
      router.push(`/rates/${saved.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.errors?.length) {
        setErrors(new Map(e.errors.map((x) => [x.path, x.message])));
      }
      toast.error(e instanceof ApiError ? e.message : 'Could not save.');
    },
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload('/rate-lists/parse-excel', rateListUploadResultSchema, form);
    },
    onSuccess: (res) => {
      setProblems(res.problems);
      if (res.items.length) {
        setRows(res.items.map(toRow));
        setErrors(new Map());
        toast.success(`Read ${res.items.length} lines from the file. Check them, then save.`);
      } else {
        toast.error('No lines could be read from the file.');
      }
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not read the file.'),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const b = body();
    const parsed = rateListInputSchema.safeParse(b);
    if (!parsed.success) {
      const map = new Map<string, string>();
      for (const i of parsed.error.issues) {
        const path = i.path.join('.');
        if (!map.has(path)) map.set(path, i.message);
      }
      setErrors(map);
      toast.error(
        `Please fix ${map.size === 1 ? 'the highlighted line' : `${map.size} problems`}.`,
      );
      return;
    }
    setErrors(new Map());
    save.mutate(b);
  };

  const err = (i: number, field: string) => errors.get(`items.${i}.${field}`);

  return (
    <form onSubmit={onSubmit} className="grid gap-5 pb-24" noValidate>
      <FormSection title="Takes effect" icon={CalendarClock} tone="amber" className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[16rem_minmax(0,1fr)]">
          <FormField
            id="effectiveFrom"
            label="Date and time (Pakistan)"
            error={errors.get('effectiveFrom')}
          >
            <Input
              id="effectiveFrom"
              type="datetime-local"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </FormField>
          <FormField
            id="remarks"
            label="Remarks (printed with the list)"
            error={errors.get('remarks')}
          >
            <Input
              id="remarks"
              value={remarks}
              placeholder="e.g. All pulses are non-returnable."
              onChange={(e) => setRemarks(e.target.value)}
            />
          </FormField>
        </div>
        <p className="text-xs text-muted-foreground">
          Orders booked from this time take these rates.{' '}
          {copiedFrom && `Started from the list of ${copiedFrom}. `}
          Rice and pulses are per 40 kg; desi ghee and spices are per tin / pack.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void api
                .download(
                  `/rate-lists/template${existingId ? `?from=${existingId}` : ''}`,
                  'rate-list.xlsx',
                )
                .catch((e: unknown) =>
                  toast.error(e instanceof ApiError ? e.message : 'Download failed.'),
                )
            }
          >
            <Download /> Excel template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            <Upload /> {upload.isPending ? 'Reading…' : 'Upload Excel'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = '';
            }}
          />
        </div>
        {problems.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>{problems.length} row(s) in the file were left out</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {problems.slice(0, 15).map((p) => (
                  <li key={`${p.row}-${p.message}`}>
                    {p.row > 0 && `Row ${p.row}: `}
                    {p.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </FormSection>

      {groupByCategory(indexed).map(([category, group]) => (
        <section key={category} className="overflow-hidden rounded-xl border bg-card">
          <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">{category}</h2>
          <ul className="divide-y">
            {group.map((r) => {
              const change = rateChange(
                r.isAvailable && RATE_RE.test(r.rate) ? r.rate : null,
                r.previousRate,
              );
              const pack =
                r.isAvailable && RATE_RE.test(r.rate)
                  ? packRate(r.basis, r.rate, r.product.packWeightKg, r.product.packPcs).toString()
                  : null;
              const rowErrors = ['productId', 'cropYear', 'rate', 'basis', 'note']
                .map((f) => err(r.index, f))
                .filter(Boolean);
              return (
                <li
                  key={r.key}
                  className={cn('grid gap-2 px-4 py-3', !r.isAvailable && 'bg-muted/30')}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'truncate text-sm font-medium',
                          !r.isAvailable && 'text-muted-foreground',
                        )}
                      >
                        {r.product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        #{r.product.sku} · {packLabel(r)}
                        {r.previousRate && <> · was {formatRate(r.previousRate)}</>}
                        {change && change.direction !== 'same' && change.direction !== 'new' && (
                          <span
                            className={
                              change.direction === 'up' ? ' text-rose-600' : ' text-emerald-600'
                            }
                          >
                            {' '}
                            ({change.text})
                          </span>
                        )}
                        {pack && <> · pack {formatPKR2(pack)}</>}
                      </p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        className="size-4 accent-emerald-600"
                        checked={r.isAvailable}
                        onChange={(e) => update(r.key, { isAvailable: e.target.checked })}
                      />
                      On sale
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[6.5rem_8rem_9rem_minmax(0,1fr)_auto]">
                    <Input
                      aria-label="Crop year"
                      placeholder="Crop yr"
                      value={r.cropYear}
                      aria-invalid={!!err(r.index, 'cropYear')}
                      onChange={(e) => update(r.key, { cropYear: e.target.value })}
                    />
                    <select
                      aria-label="Basis"
                      className="h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                      value={r.basis}
                      onChange={(e) => update(r.key, { basis: e.target.value as RateBasis })}
                    >
                      <option value="PER_40KG">per 40 kg</option>
                      <option value="PER_UNIT">per pack</option>
                    </select>
                    <Input
                      aria-label="Rate"
                      inputMode="decimal"
                      placeholder={r.isAvailable ? 'Rate' : 'N/A'}
                      value={r.rate}
                      disabled={!r.isAvailable}
                      aria-invalid={!!err(r.index, 'rate')}
                      className="text-right tabular-nums"
                      onChange={(e) => update(r.key, { rate: e.target.value.replace(/,/g, '') })}
                    />
                    <Input
                      aria-label="Note"
                      placeholder="Note (e.g. Australia)"
                      value={r.note}
                      onChange={(e) => update(r.key, { note: e.target.value })}
                    />
                    <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title="Add another crop year for this product"
                        onClick={() => addCropYear(r)}
                      >
                        <Plus /> Crop year
                      </Button>
                      {(countByProduct.get(r.product.id) ?? 0) > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove this line"
                          onClick={() => remove(r.key)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </div>
                  {rowErrors.length > 0 && (
                    <p className="text-sm text-destructive">{rowErrors[0]}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-[96rem] items-center gap-3 px-1 md:px-3">
          <p className="flex-1 text-sm text-muted-foreground">
            {onSale} on sale · {rows.length - onSale} N/A
          </p>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            <Save /> {save.isPending ? 'Saving…' : existingId ? 'Save' : 'Publish'}
          </Button>
        </div>
      </div>
    </form>
  );
}
