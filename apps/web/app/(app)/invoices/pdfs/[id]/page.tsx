'use client';

import {
  formatNumber,
  formatPKR,
  formatPKR2,
  type PdfImportDetail,
  pdfImportDetailSchema,
  type PdfResolution,
  pdfResolutionSchema,
  productOptionSchema,
  subPartyOptionSchema,
} from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ExternalLink, FileText, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Combobox } from '@/components/combobox';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeading } from '@/components/form-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { PDF_STATUS, PDFS_KEY, pdfFileUrl, usePdfImport } from '@/lib/invoice-pdfs';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';
import { formatOrderDate, ORDERS_KEY } from '@/lib/orders';
import { formatRate, shortCropYear } from '@/lib/rate-lists';
import { cn } from '@/lib/utils';

const productOptionsSchema = z.array(productOptionSchema);
const subPartyOptionsSchema = z.array(subPartyOptionSchema);

/** Saved decisions, with the system's guesses filled in where nothing is decided yet. */
function initialResolution(d: PdfImportDetail): PdfResolution {
  const saved = pdfResolutionSchema.parse(d.resolution ?? {});
  const lines = { ...saved.lines };
  for (const l of d.lines) {
    const k = String(l.srNo);
    if (!l.product && l.productSuggestion && !lines[k]?.productId) {
      lines[k] = { ...lines[k], productId: l.productSuggestion.id };
    }
  }
  return {
    ...saved,
    partyId: saved.partyId ?? (d.matched.party ? null : (d.matched.partySuggestion?.id ?? null)),
    lines,
  };
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || '—'}</p>
    </div>
  );
}

export default function InvoicePdfPage() {
  const { id } = useParams<{ id: string }>();
  const pdf = usePdfImport(id);
  if (pdf.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (pdf.error) return <p className="text-sm text-destructive">{pdf.error.message}</p>;
  return <Review key={pdf.dataUpdatedAt} detail={pdf.data} />;
}

function Review({ detail: d }: { detail: PdfImportDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const products = useMasterOptions('products', productOptionsSchema);
  const parties = useMasterOptions('parties');
  const [res, setRes] = useState<PdfResolution>(() => initialResolution(d));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const partyId = res.partyId ?? d.matched.party?.id ?? null;
  const subParties = useMasterOptions(
    'sub-parties',
    subPartyOptionsSchema,
    partyId ? `?partyId=${partyId}` : '',
  );
  const posted = d.status === 'POSTED' && !!d.invoiceId;
  const dirty =
    JSON.stringify(res) !== JSON.stringify(pdfResolutionSchema.parse(d.resolution ?? {}));

  const resolve = useMutation({
    mutationFn: (post: boolean) =>
      api.post(`/invoice-pdfs/${d.id}/resolve`, pdfImportDetailSchema, { resolution: res, post }),
    onSuccess: (next, post) => {
      queryClient.setQueryData([...PDFS_KEY, 'detail', d.id], next);
      void queryClient.invalidateQueries({ queryKey: [...PDFS_KEY, 'list'] });
      if (next.status === 'POSTED') {
        toast.success(`Invoice ${next.invoiceNo} recorded.`);
        void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
        void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      } else if (post) {
        toast.error(next.problems[0] ?? 'Not posted yet.');
      } else {
        toast.success(next.ready ? 'All clear — ready to post.' : 'Checked.');
      }
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong.'),
  });

  const discard = useMutation({
    mutationFn: () => api.delete(`/invoice-pdfs/${d.id}`, z.undefined()),
    onSuccess: () => {
      toast.success('PDF discarded.');
      void queryClient.invalidateQueries({ queryKey: PDFS_KEY });
      router.push('/invoices/pdfs');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not discard.'),
  });

  const setLine = (
    srNo: number,
    patch: { productId?: string | null; allowWithoutOrder?: boolean },
  ) =>
    setRes((r) => ({
      ...r,
      lines: { ...r.lines, [String(srNo)]: { ...r.lines[String(srNo)], ...patch } },
    }));

  const productOptions = (products.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
    hint: `#${p.sku} · ${p.packWeightKg} kg`,
  }));

  return (
    <div className="grid max-w-5xl gap-5 pb-24">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
          <Link href="/invoices/pdfs">
            <ArrowLeft /> Invoice PDFs
          </Link>
        </Button>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <PageHeading icon={FileText} tone="indigo">
              Invoice {d.invoiceNo ?? '?'}
            </PageHeading>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={PDF_STATUS[d.status].variant}>{PDF_STATUS[d.status].label}</Badge>
              {d.invoiceDate && formatOrderDate(d.invoiceDate)} · {d.fileName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={pdfFileUrl(d.id)} target="_blank" rel="noreferrer">
                <ExternalLink /> View PDF
              </a>
            </Button>
            {posted && d.invoiceId && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/invoices/${d.invoiceId}`}>Open invoice</Link>
              </Button>
            )}
            {!posted && (
              <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(true)}>
                <Trash2 /> Discard
              </Button>
            )}
          </div>
        </div>
      </div>

      {!posted && d.problems.length > 0 && (
        <section className="rounded-xl border border-amber-500/60 bg-amber-50/60 p-4 text-sm dark:bg-amber-500/10">
          <p className="mb-1 font-semibold">To post this invoice:</p>
          <ul className="list-disc pl-5">
            {d.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-x-6 gap-y-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Party (on the PDF)" value={d.header.party} />
        <Field label="Sub Party (on the PDF)" value={d.header.subParty} />
        <Field label="City" value={d.matched.city?.name ?? d.header.city} />
        <Field label="Salesman (party's)" value={d.matched.salesperson?.name} />
        <Field label="D.O. No." value={d.header.doNo} />
        <Field label="DC No." value={d.header.dcNo} />
        <Field label="OGP No." value={d.header.ogpNo} />
        <Field label="Vehicle No." value={d.header.vehicleNo} />
        {d.header.orderNo && (
          <Field
            label="Order named on the invoice"
            value={
              d.matched.order
                ? `Order ${d.matched.order.orderNo}`
                : `O.N ${d.header.orderNo} (not found)`
            }
          />
        )}
        {d.goLiveDate && (
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
            Go-live date {formatOrderDate(d.goLiveDate)}: invoices up to that day don&apos;t reduce
            opening orders.
          </p>
        )}
      </section>

      {!posted && (
        <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Party in the system</p>
            <Combobox
              options={toComboboxOptions(parties.data, d.matched.party)}
              value={partyId}
              onChange={(v) => setRes((r) => ({ ...r, partyId: v, subPartyId: null }))}
              placeholder="Choose the party…"
            />
            {!d.matched.party && d.matched.partySuggestion && (
              <p className="text-xs text-muted-foreground">
                Suggested: {d.matched.partySuggestion.name}. Remembered for next time.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Sub party (optional, e.g. Arslan Dar)</p>
            <Combobox
              options={toComboboxOptions(subParties.data, d.matched.subParty)}
              value={res.subPartyId ?? null}
              onChange={(v) => setRes((r) => ({ ...r, subPartyId: v }))}
              noneLabel="No sub party"
              placeholder="None"
              disabled={!partyId}
            />
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border bg-card">
        <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">Products</h2>
        <ul className="divide-y">
          {d.lines.map((l) => {
            const choice = res.lines[String(l.srNo)];
            const differs = l.computedAmount !== null && l.computedAmount !== l.amount;
            return (
              <li key={l.srNo} className="grid gap-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {l.srNo}. {l.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {l.cropYear && `${shortCropYear(l.cropYear)} · `}
                      {formatNumber(String(l.qty), 0)} ×{' '}
                      {l.basis === 'PER_UNIT'
                        ? `${formatPKR2(l.bagRate || '0')} a pack`
                        : `${formatRate(l.rate40Kg || '0')} per 40 kg`}{' '}
                      · {formatNumber(l.weight || '0', 0)} kg
                    </p>
                  </div>
                  <p className={cn('font-semibold tabular-nums', differs && 'text-rose-600')}>
                    {formatPKR(l.amount || '0')}
                    {differs && (
                      <span className="block text-xs font-normal">
                        system: {formatPKR(l.computedAmount!)}
                      </span>
                    )}
                  </p>
                </div>
                {!posted && (
                  <Combobox
                    options={productOptions}
                    value={choice?.productId ?? l.product?.id ?? null}
                    onChange={(v) => setLine(l.srNo, { productId: v })}
                    placeholder="Choose the product…"
                  />
                )}
                {posted && l.product && <p className="text-xs">{l.product.name}</p>}
                {l.allocations.length > 0 && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Delivers{' '}
                    {l.allocations
                      .map(
                        (a) =>
                          `${formatNumber(String(a.qtyPacks), 0)} on order ${a.orderNo} (${formatOrderDate(a.orderDate)})`,
                      )
                      .join(', ')}
                  </p>
                )}
                {l.unallocated > 0 &&
                  (l.allocations.length > 0 ||
                    !l.problems.some((p) => /Choose|amount|kg/.test(p))) && (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="size-4 accent-indigo-600"
                        disabled={posted}
                        checked={choice?.allowWithoutOrder ?? l.allowWithoutOrder}
                        onChange={(e) => setLine(l.srNo, { allowWithoutOrder: e.target.checked })}
                      />
                      Record {formatNumber(String(l.unallocated), 0)} without a pending order
                    </label>
                  )}
                {!posted &&
                  l.problems.map((p) => (
                    <p key={p} className="text-xs text-destructive">
                      {p}
                    </p>
                  ))}
              </li>
            );
          })}
        </ul>
        <div className="flex justify-between border-t bg-muted/30 px-4 py-3 text-sm font-semibold">
          <span>
            {formatNumber(d.totals.qty || '0', 0)} packs · {formatNumber(d.totals.weight || '0', 0)}{' '}
            kg
          </span>
          <span className="tabular-nums">Rs {formatPKR(d.totals.amount || '0')}</span>
        </div>
      </section>

      {!posted && d.status !== 'DUPLICATE' && d.status !== 'FAILED' && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:left-64">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-1 md:px-3">
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {d.ready && !dirty
                ? 'All clear.'
                : dirty
                  ? 'Changes not checked yet.'
                  : `${d.problems.length} thing(s) to fix.`}
            </p>
            <Button
              variant="outline"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate(false)}
            >
              <Check /> Check
            </Button>
            <Button disabled={resolve.isPending} onClick={() => resolve.mutate(true)}>
              <Send /> Post invoice
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this PDF?"
        description="Nothing was recorded from it. You can upload it again later."
        confirmLabel="Discard"
        destructive
        busy={discard.isPending}
        onConfirm={() => discard.mutate()}
      />
    </div>
  );
}
