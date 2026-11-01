'use client';

import { dec, type DecimalInput, formatPKR, partyPositionSchema } from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * Credit control on the invoice form (Phase 2): warns when the party has overdue bills or
 * this invoice takes it over its credit limit. Warn only — saving is never blocked.
 *
 * `savedTotal` is this invoice's saved amount when editing it for the same party; it is
 * already inside "outstanding", so it is taken out before adding the new total.
 */
export function CreditWarning({
  partyId,
  invoiceTotal,
  savedTotal = '0',
}: {
  partyId: string | null;
  invoiceTotal: DecimalInput;
  savedTotal?: DecimalInput;
}) {
  const { can } = useAuth();
  const position = useQuery({
    queryKey: ['recovery', 'position', partyId],
    queryFn: () => api.get(`/recovery/parties/${partyId}/position`, partyPositionSchema),
    enabled: !!partyId && can('payment.read'),
  });
  const p = position.data;
  if (!partyId || !p || p.party.id !== partyId) return null;

  const overdue = dec(p.overdue);
  const projected = dec(p.outstanding).minus(savedTotal).plus(invoiceTotal);
  const overBy = p.creditLimit !== null ? projected.minus(p.creditLimit) : null;
  const overLimit = overBy !== null && overBy.gt(0);
  if (!overdue.gt(0) && !overLimit) return null;

  return (
    <div
      role="status"
      className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="grid gap-1">
        {overdue.gt(0) && (
          <p>
            <span className="font-semibold">Overdue: PKR {formatPKR(overdue)}</span>{' '}
            {p.overdueInvoices > 0
              ? `on ${p.overdueInvoices} ${p.overdueInvoices === 1 ? 'invoice' : 'invoices'} — oldest ${p.oldestOverdueDays} days`
              : 'from the opening balance'}{' '}
            (credit {p.creditDays} days).
          </p>
        )}
        {overLimit && (
          <p>
            <span className="font-semibold">Over credit limit by PKR {formatPKR(overBy)}</span>:
            outstanding {formatPKR(dec(p.outstanding).minus(savedTotal))} + this invoice{' '}
            {formatPKR(invoiceTotal)} = {formatPKR(projected)} (limit {formatPKR(p.creditLimit!)}).
          </p>
        )}
        <p className="text-xs text-amber-800/80 dark:text-amber-200/70">
          You can still save.{' '}
          <Link
            href={`/recovery/${partyId}`}
            target="_blank"
            className="font-medium underline underline-offset-2"
          >
            Open ledger
          </Link>
        </p>
      </div>
    </div>
  );
}
