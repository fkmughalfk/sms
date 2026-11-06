'use client';

import {
  businessToday,
  formatPKR,
  slipDetailSchema,
  slipDetailsSchema,
  type SlipStatus,
} from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, ChevronRight, Receipt, Save } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FormSection, PageHeading } from '@/components/form-section';
import {
  fromDetails,
  SlipFields,
  type SlipValues,
  toSlipBody,
} from '@/components/payment/slip-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatOrderDate } from '@/lib/orders';
import { shrinkPhoto, SLIP_STATUS, SLIPS_KEY, useSlips } from '@/lib/payment-slips';

interface Duplicate {
  paymentDate: string;
  amount: string;
  slipNo: string | null;
  party: string;
  why: string;
}

const blank = (): SlipValues => ({
  ...fromDetails({}),
  paymentDate: businessToday(),
});

/**
 * Payment slips (orders module, phase O5): upload the bank slip or transfer screenshot,
 * choose the party and fill in what it says. The office's are saved as payments at once;
 * a salesman's wait under "To confirm".
 */
export default function PaymentSlipsPage() {
  const { can } = useAuth();
  const office = can('payment.edit');
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [values, setValues] = useState<SlipValues>(blank);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null);
  const [status, setStatus] = useState<SlipStatus | ''>(office ? 'TO_CONFIRM' : '');
  const input = useRef<HTMLInputElement>(null);
  const list = useSlips(status);

  const choose = (f: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  };

  const send = useMutation({
    mutationFn: async (allowDuplicate: boolean) => {
      const form = new FormData();
      form.append('file', await shrinkPhoto(file!));
      form.append('data', JSON.stringify({ details: toSlipBody(values), allowDuplicate }));
      return api.upload('/payment-slips', slipDetailSchema, form);
    },
    onSuccess: (s) => {
      toast.success(
        s.status === 'SAVED'
          ? `Payment of Rs ${formatPKR(s.amount)} recorded.`
          : 'Slip sent to the office to confirm.',
      );
      choose(null);
      setValues(blank());
      setDuplicates(null);
      setErrors(new Map());
      void queryClient.invalidateQueries({ queryKey: SLIPS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['recovery'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.statusCode === 409) {
        setDuplicates((e.body as { duplicates?: Duplicate[] }).duplicates ?? []);
      } else if (e instanceof ApiError && e.errors?.length) {
        setErrors(new Map(e.errors.map((x) => [x.path, x.message])));
      }
      toast.error(e instanceof ApiError ? e.message : 'Could not save.');
    },
  });

  const submit = (allowDuplicate = false) => {
    if (!file) return toast.error('Add the slip photo or screenshot first.');
    const parsed = slipDetailsSchema.safeParse(toSlipBody(values));
    if (!parsed.success) {
      const map = new Map<string, string>();
      for (const i of parsed.error.issues) {
        const k = `details.${String(i.path[0])}`;
        if (!map.has(k)) map.set(k, i.message);
      }
      setErrors(map);
      return toast.error(map.values().next().value ?? 'Check the details.');
    }
    setErrors(new Map());
    send.mutate(allowDuplicate);
  };

  return (
    <div className="grid max-w-5xl gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
          <Link href="/payments">
            <ArrowLeft /> Payments
          </Link>
        </Button>
        <PageHeading icon={Receipt} tone="emerald">
          Payment slips
        </PageHeading>
        <p className="text-sm text-muted-foreground">
          {office
            ? 'Upload a deposit slip or transfer screenshot: it is recorded as a payment once saved.'
            : 'Upload the deposit slip or transfer screenshot: the office checks it before it counts.'}
        </p>
      </div>

      <FormSection title="New slip" icon={Camera} tone="emerald" className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="grid min-h-40 place-items-center overflow-hidden rounded-lg border-2 border-dashed text-center text-sm text-muted-foreground hover:bg-muted/40"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Slip" className="max-h-72 w-full object-contain" />
            ) : file ? (
              <span className="p-4">{file.name}</span>
            ) : (
              <span className="grid place-items-center gap-1 p-4">
                <Camera className="size-6" />
                Take a photo or choose a screenshot / PDF
              </span>
            )}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              choose(e.target.files?.[0] ?? null);
              setDuplicates(null);
              e.target.value = '';
            }}
          />
          <SlipFields
            value={values}
            onChange={(v) => {
              setValues(v);
              setDuplicates(null);
            }}
            errors={errors}
          />
        </div>
        {duplicates && (
          <div className="rounded-lg border border-amber-500/60 bg-amber-50/60 p-3 text-sm dark:bg-amber-500/10">
            <p className="font-semibold">This looks like a payment already recorded:</p>
            <ul className="mt-1 list-disc pl-5">
              {duplicates.map((d) => (
                <li key={`${d.paymentDate}-${d.amount}-${d.slipNo}`}>
                  {formatOrderDate(d.paymentDate)} · {d.party} · Rs {formatPKR(d.amount)}
                  {d.slipNo && ` · ${d.slipNo}`} ({d.why})
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => submit(true)}>
              It&apos;s a different payment — save anyway
            </Button>
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={() => submit()} disabled={send.isPending}>
            <Save /> {send.isPending ? 'Saving…' : office ? 'Save payment' : 'Send to office'}
          </Button>
        </div>
      </FormSection>

      <div className="flex flex-wrap gap-2">
        {(['TO_CONFIRM', 'SAVED', 'REJECTED', ''] as const).map((s) => (
          <Button
            key={s || 'all'}
            size="sm"
            variant={status === s ? 'default' : 'outline'}
            onClick={() => setStatus(s)}
          >
            {s ? SLIP_STATUS[s].label : 'All'}
            {s && list.data?.counts[s] ? ` (${list.data.counts[s]})` : ''}
          </Button>
        ))}
      </div>
      {list.data && list.data.data.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No slips here.
        </p>
      )}
      {list.data && list.data.data.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {list.data.data.map((s) => (
            <li key={s.id}>
              <Link
                href={`/payments/slips/${s.id}`}
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.party.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatOrderDate(s.paymentDate)}
                    {s.bank && ` · ${s.bank.name}`}
                    {s.slipNo && ` · ${s.slipNo}`}
                    {s.depositor && ` · ${s.depositor}`} · by {s.uploadedBy.name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatPKR(s.amount)}</p>
                  <Badge variant={SLIP_STATUS[s.status].variant}>
                    {SLIP_STATUS[s.status].label}
                  </Badge>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
