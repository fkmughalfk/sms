'use client';

import { formatPKR, partyDiscountsSchema } from '@sms/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
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

/**
 * Prompt-payment discount for one party (phase O6): credits given (the office can reverse
 * one) and invoices that can still earn theirs, with the last day to pay.
 */
export function DiscountPanel({ partyId }: { partyId: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const data = useQuery({
    queryKey: ['discounts', partyId],
    queryFn: () => api.get(`/discounts?partyId=${partyId}`, partyDiscountsSchema),
  });
  const reverse = useMutation({
    mutationFn: () => api.post(`/discounts/${reversing}/reverse`, partyDiscountsSchema, { reason }),
    onSuccess: (next) => {
      queryClient.setQueryData(['discounts', partyId], next);
      void queryClient.invalidateQueries({ queryKey: ['recovery'] });
      toast.success('Discount reversed.');
      setReversing(null);
      setReason('');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not reverse.'),
  });

  const d = data.data;
  if (!d || (d.credits.length === 0 && d.eligible.length === 0)) return null;

  return (
    <section className="no-print grid gap-3 rounded-xl border bg-card p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        <BadgePercent className="size-4 text-emerald-600" /> Prompt-payment discount
      </h2>
      {d.eligible.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            Can still be earned (pay in full by):
          </p>
          <ul className="grid gap-1">
            {d.eligible.map((e) => (
              <li key={e.invoiceId} className="flex flex-wrap justify-between gap-2">
                <Link href={`/invoices/${e.invoiceId}`} className="hover:underline">
                  Invoice #{e.invoiceNo} · {formatOrderDate(e.invoiceDate)}
                </Link>
                <span>
                  Rs {formatPKR(e.discount)} if paid by <b>{formatOrderDate(e.payBy)}</b>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.credits.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Credited to the ledger:</p>
          <ul className="grid gap-1.5">
            {d.credits.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Invoice #{c.invoice.invoiceNo} · Rs {formatPKR(c.amount)} on{' '}
                  {formatOrderDate(c.creditDate)}
                  {c.status === 'REVERSED' && (
                    <span className="text-muted-foreground">
                      {' '}
                      — reversed by {c.reversedBy}: {c.reversedReason}
                    </span>
                  )}
                </span>
                {c.status === 'ACTIVE' ? (
                  can('payment.edit') && (
                    <Button size="sm" variant="outline" onClick={() => setReversing(c.id)}>
                      Reverse
                    </Button>
                  )
                ) : (
                  <Badge variant="secondary">Reversed</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Dialog open={reversing !== null} onOpenChange={(o) => !o && setReversing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse this discount?</DialogTitle>
            <DialogDescription>
              The amount goes back on the party&apos;s balance and won&apos;t be credited again.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversing(null)}>
              Back
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || reverse.isPending}
              onClick={() => reverse.mutate()}
            >
              Reverse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
