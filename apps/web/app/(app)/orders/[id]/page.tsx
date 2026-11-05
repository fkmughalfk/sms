'use client';

import { formatNumber, formatPKR, formatPKR2, orderDetailSchema } from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Check, ClipboardList, Lock, Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeading } from '@/components/form-section';
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
import { formatOrderDate, ORDER_STATUS, ORDERS_KEY, packWord, useOrder } from '@/lib/orders';
import { BASIS_LABEL, formatEffective, formatRate, shortCropYear } from '@/lib/rate-lists';

type Action = 'approve' | 'reject' | 'cancel' | 'close';
const ACTION_TEXT: Record<Exclude<Action, 'approve'>, { title: string; button: string }> = {
  reject: { title: 'Reject this order?', button: 'Reject' },
  cancel: { title: 'Cancel this order?', button: 'Cancel order' },
  close: { title: 'Close this order?', button: 'Close order' },
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const order = useOrder(id);
  const [asking, setAsking] = useState<Exclude<Action, 'approve'> | null>(null);
  const [reason, setReason] = useState('');

  const act = useMutation({
    mutationFn: ({ action, reason }: { action: Action; reason?: string }) =>
      api.post(`/orders/${id}/${action}`, orderDetailSchema, reason ? { reason } : undefined),
    onSuccess: (o) => {
      toast.success(`Order ${o.orderNo}: ${ORDER_STATUS[o.status].label.toLowerCase()}.`);
      queryClient.setQueryData([...ORDERS_KEY, 'detail', id], o);
      void queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, 'list'] });
      setAsking(null);
      setReason('');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong.'),
  });

  if (order.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (order.error) return <p className="text-sm text-destructive">{order.error.message}</p>;
  const o = order.data;
  const manage = can('order.manage');
  const own = o.createdBy.id === user?.id;
  const open = o.status === 'SUBMITTED' || o.status === 'PENDING';
  const canEdit = manage ? open : own && o.status === 'SUBMITTED';
  const canCancel = manage ? open : own && o.status === 'SUBMITTED';

  return (
    <div className="grid gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
          <Link href="/orders">
            <ArrowLeft /> Orders
          </Link>
        </Button>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <PageHeading icon={ClipboardList} tone="sky">
              Order {o.orderNo}
            </PageHeading>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={ORDER_STATUS[o.status].variant}>{ORDER_STATUS[o.status].label}</Badge>
              {formatOrderDate(o.orderDate)} · by {o.createdBy.name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {manage && o.status === 'SUBMITTED' && (
              <>
                <Button
                  size="sm"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ action: 'approve' })}
                >
                  <Check /> Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAsking('reject')}>
                  <X /> Reject
                </Button>
              </>
            )}
            {canEdit && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/orders/${o.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            {manage && o.status === 'PENDING' && (
              <Button size="sm" variant="outline" onClick={() => setAsking('close')}>
                <Lock /> Close
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="outline" onClick={() => setAsking('cancel')}>
                <Ban /> Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {o.statusReason && (
        <p className="rounded-lg border bg-muted/40 px-4 py-2 text-sm">
          <span className="font-medium">{ORDER_STATUS[o.status].label}:</span> {o.statusReason}
          {o.reviewedBy && <span className="text-muted-foreground"> — {o.reviewedBy.name}</span>}
        </p>
      )}

      <section className="grid gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Party" value={o.party.name} />
        <Info label="Sub party" value={o.subParty?.name} />
        <Info label="City" value={o.city?.name} />
        <Info label="Salesman" value={o.salesperson?.name} />
        <Info
          label="Rates from"
          value={o.rateList ? `List of ${formatEffective(o.rateList.effectiveFrom)}` : undefined}
        />
        <Info
          label="Approved by"
          value={o.status === 'PENDING' && o.reviewedBy ? o.reviewedBy.name : undefined}
        />
        <Info label="Remarks" value={o.remarks ?? undefined} />
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">Products</h2>
        <ul className="divide-y">
          {o.lines.map((l) => (
            <li
              key={l.lineNo}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {l.product.name}
                  {l.cropYear && (
                    <span className="text-muted-foreground"> · {shortCropYear(l.cropYear)}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {l.qtyPacks} {packWord(l.packPcs, l.qtyPacks)} × {formatPKR2(l.ratePerPack)} ·{' '}
                  {formatRate(l.rate)} {BASIS_LABEL[l.basis]}
                  {l.listRate &&
                    l.listRate !== l.rate &&
                    ` (list ${formatRate(l.listRate)})`} · {formatNumber(l.weightKg, 0)} kg ·
                  pending {l.pendingPacks}
                </p>
              </div>
              <p className="self-center font-semibold tabular-nums">{formatPKR(l.amount)}</p>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t bg-muted/30 px-4 py-3 text-sm font-semibold">
          <span>
            {o.totalPacks} packs · {formatNumber(o.totalWeightKg, 0)} kg
          </span>
          <span className="tabular-nums">Rs {formatPKR(o.totalAmount)}</span>
        </div>
      </section>

      {o.discounts.length > 0 && (
        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 font-semibold">Prompt-payment discount</h2>
          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
            {o.discounts.map((d) => (
              <li key={d.category.id}>
                {d.category.name}: <span className="font-medium">Rs {formatRate(d.amount)}</span>{' '}
                {d.unit === 'PER_40KG' ? 'per 40 kg' : 'per kg'}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={asking !== null} onOpenChange={(v) => !v && setAsking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{asking ? ACTION_TEXT[asking].title : ''}</DialogTitle>
            <DialogDescription>
              Order {o.orderNo} · {o.party.name}. Give a reason.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Reason"
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(null)}>
              Back
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || act.isPending}
              onClick={() => asking && act.mutate({ action: asking, reason: reason.trim() })}
            >
              {asking ? ACTION_TEXT[asking].button : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || '—'}</p>
    </div>
  );
}
