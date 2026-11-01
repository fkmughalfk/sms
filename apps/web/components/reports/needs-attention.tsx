'use client';

import { formatPKR, recoverySummarySchema } from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Section } from './section';

const QUERY = 'overdueOnly=true&sort=overdue:desc&pageSize=5';

/**
 * Dashboard "Needs attention today" (Phase 2): parties with overdue bills, largest first.
 * Always as of today — not tied to the dashboard period.
 */
export function NeedsAttention() {
  const overdue = useQuery({
    queryKey: ['recovery', 'summary', QUERY],
    queryFn: () => api.get(`/recovery/parties?${QUERY}`, recoverySummarySchema),
  });
  const data = overdue.data;

  return (
    <Section
      title="Needs attention today"
      action={
        <Link href="/recovery" className="text-xs text-muted-foreground hover:underline">
          Recovery
        </Link>
      }
    >
      {overdue.error ? (
        <p className="text-sm text-destructive">{overdue.error.message}</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.data.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> Nothing overdue — every party is within its credit
          days.
        </p>
      ) : (
        <div className="grid gap-3">
          <p className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 text-rose-500" />
            <span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                PKR {formatPKR(data.totals.overdue)}
              </span>{' '}
              overdue across {data.meta.total} {data.meta.total === 1 ? 'party' : 'parties'}
            </span>
          </p>
          <ul className="grid divide-y rounded-lg border text-sm">
            {data.data.map((r) => (
              <li key={r.party.id}>
                <Link
                  href={`/recovery/${r.party.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50"
                >
                  <span className="min-w-0 truncate font-medium">{r.party.name}</span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    {r.oldestOverdueDays !== null && (
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                        {r.oldestOverdueDays} days
                      </span>
                    )}
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      {formatPKR(r.overdue)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
