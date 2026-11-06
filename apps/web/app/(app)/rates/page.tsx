'use client';

import { ChevronRight, Plus, Tags } from 'lucide-react';
import Link from 'next/link';
import { PageHeading } from '@/components/form-section';
import { RateListLines } from '@/components/rate-list/rate-list-lines';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { formatEffective, STATUS_BADGE, useCurrentRateList, useRateLists } from '@/lib/rate-lists';

/** Rate lists: today's rates first, then every list by date (orders module, phase O1). */
export default function RateListsPage() {
  const { can } = useAuth();
  const current = useCurrentRateList();
  const lists = useRateLists();
  const canManage = can('rateList.manage');

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <PageHeading icon={Tags} tone="amber">
            Rate Lists
          </PageHeading>
          <p className="text-sm text-muted-foreground">
            Market rates. Orders take their rates from the current list.
          </p>
        </div>
        {canManage && (
          <Button asChild>
            <Link href="/rates/new">
              <Plus /> New rate list
            </Link>
          </Button>
        )}
      </div>

      {lists.data && lists.data.data.length > 0 && (
        <section className="overflow-hidden rounded-xl border bg-card">
          <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">All lists</h2>
          <ul className="divide-y">
            {lists.data.data.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/rates/${l.id}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{formatEffective(l.effectiveFrom)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.availableCount} on sale · {l.itemCount - l.availableCount} N/A
                      {l.createdBy && ` · by ${l.createdBy}`}
                      {l.remarks && ` · ${l.remarks}`}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE[l.status].variant}>
                    {STATUS_BADGE[l.status].label}
                  </Badge>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-3">
        <h2 className="text-lg font-semibold">
          Current rates
          {current.data && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              from {formatEffective(current.data.effectiveFrom)}
            </span>
          )}
        </h2>
        {current.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {current.error && <p className="text-sm text-destructive">{current.error.message}</p>}
        {current.data === null && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No rate list is in effect yet.
            {canManage && ' Create one with "New rate list".'}
          </p>
        )}
        {current.data && (
          <>
            {current.data.remarks && (
              <p className="text-sm text-muted-foreground">{current.data.remarks}</p>
            )}
            <RateListLines lines={current.data.items} showChange={!!current.data.previous} />
          </>
        )}
      </div>
    </div>
  );
}
