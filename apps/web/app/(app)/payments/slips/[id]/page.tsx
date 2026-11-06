'use client';

import { formatPKR, type SlipDetail, slipDetailSchema, slipDetailsSchema } from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ExternalLink, Receipt, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeading } from '@/components/form-section';
import {
  fromDetails,
  SlipFields,
  type SlipValues,
  toSlipBody,
} from '@/components/payment/slip-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatOrderDate } from '@/lib/orders';
import { SLIP_STATUS, SLIPS_KEY, slipFileUrl, useSlip } from '@/lib/payment-slips';

export default function SlipPage() {
  const { id } = useParams<{ id: string }>();
  const slip = useSlip(id);
  if (slip.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (slip.error) return <p className="text-sm text-destructive">{slip.error.message}</p>;
  return <Slip key={slip.dataUpdatedAt} s={slip.data} />;
}

function Slip({ s }: { s: SlipDetail }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const office = can('payment.edit') && s.status === 'TO_CONFIRM';
  const [values, setValues] = useState<SlipValues>(() => fromDetails(s.details));
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const isImage = s.mimeType.startsWith('image/');

  const done = (next: SlipDetail, message: string) => {
    toast.success(message);
    queryClient.setQueryData([...SLIPS_KEY, 'detail', s.id], next);
    void queryClient.invalidateQueries({ queryKey: [...SLIPS_KEY, 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
    void queryClient.invalidateQueries({ queryKey: ['recovery'] });
  };
  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.errors?.length) {
      setErrors(new Map(e.errors.map((x) => [x.path, x.message])));
    }
    toast.error(e instanceof ApiError ? e.message : 'Something went wrong.');
  };

  const confirm = useMutation({
    mutationFn: (allowDuplicate: boolean) =>
      api.post(`/payment-slips/${s.id}/confirm`, slipDetailSchema, {
        details: toSlipBody(values),
        allowDuplicate,
      }),
    onSuccess: (next) => done(next, `Payment of Rs ${formatPKR(next.amount)} recorded.`),
    onError: fail,
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/payment-slips/${s.id}/reject`, slipDetailSchema, { reason }),
    onSuccess: (next) => {
      setRejecting(false);
      done(next, 'Slip rejected.');
    },
    onError: fail,
  });

  const submit = (allowDuplicate = false) => {
    const parsed = slipDetailsSchema.safeParse(toSlipBody(values));
    if (!parsed.success) {
      const map = new Map<string, string>();
      for (const i of parsed.error.issues) map.set(`details.${String(i.path[0])}`, i.message);
      setErrors(map);
      return toast.error(map.values().next().value ?? 'Check the details.');
    }
    confirm.mutate(allowDuplicate);
  };

  return (
    <div className="grid max-w-5xl gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
          <Link href="/payments/slips">
            <ArrowLeft /> Payment slips
          </Link>
        </Button>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <PageHeading icon={Receipt} tone="emerald">
              Rs {formatPKR(s.amount)} · {s.party.name}
            </PageHeading>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={SLIP_STATUS[s.status].variant}>{SLIP_STATUS[s.status].label}</Badge>
              {formatOrderDate(s.paymentDate)} · uploaded by {s.uploadedBy.name}
              {s.reviewedBy &&
                ` · ${s.status === 'SAVED' ? 'saved' : 'reviewed'} by ${s.reviewedBy.name}`}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={slipFileUrl(s.id)} target="_blank" rel="noreferrer">
              <ExternalLink /> Open slip
            </a>
          </Button>
        </div>
      </div>

      {s.rejectReason && (
        <p className="rounded-lg border bg-muted/40 px-4 py-2 text-sm">
          <span className="font-medium">Rejected:</span> {s.rejectReason}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="overflow-hidden rounded-xl border bg-card">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slipFileUrl(s.id)}
              alt="Payment slip"
              className="max-h-[36rem] w-full object-contain"
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">PDF slip — use “Open slip”.</p>
          )}
        </div>
        <div className="grid content-start gap-4 rounded-xl border bg-card p-4">
          <SlipFields value={values} onChange={setValues} errors={errors} disabled={!office} />
          {office && s.duplicates.length > 0 && (
            <div className="rounded-lg border border-amber-500/60 bg-amber-50/60 p-3 text-sm dark:bg-amber-500/10">
              <p className="font-semibold">Looks like a payment already recorded:</p>
              <ul className="mt-1 list-disc pl-5">
                {s.duplicates.map((d) => (
                  <li key={d.paymentId}>
                    {formatOrderDate(d.paymentDate)} · {d.party} · Rs {formatPKR(d.amount)}
                    {d.slipNo && ` · ${d.slipNo}`} ({d.why})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {office && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(true)}>
                <X /> Reject
              </Button>
              {s.duplicates.length > 0 ? (
                <Button disabled={confirm.isPending} onClick={() => submit(true)}>
                  <Check /> Different payment — save
                </Button>
              ) : (
                <Button disabled={confirm.isPending} onClick={() => submit()}>
                  <Check /> Confirm &amp; save payment
                </Button>
              )}
            </div>
          )}
          {s.paymentId && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Recorded as a payment.{' '}
              {can('payment.edit') && (
                <Link href={`/payments/${s.paymentId}/edit`} className="font-medium underline">
                  Open payment
                </Link>
              )}
            </p>
          )}
        </div>
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject this slip?</DialogTitle>
            <DialogDescription>
              Nothing is recorded. The salesman sees the reason.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || reject.isPending}
              onClick={() => reject.mutate()}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
