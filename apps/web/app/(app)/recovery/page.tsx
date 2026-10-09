'use client';

import { dec, formatPKR2, formatPercent, recoverySummarySchema } from '@sms/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { Combobox } from '@/components/combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';
import { cn } from '@/lib/utils';

/** Share bar for "% Recovered" (Payments J20:N…). */
function RecoveryBar({ rate }: { rate: string }) {
  const pct = Math.max(0, Math.min(100, Number(dec(rate).times(100).toFixed(1))));
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="tabular-nums">{formatPercent(rate, 1)}</span>
      <span
        className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block"
        aria-hidden
      >
        <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

/** Spec §5.4 — recovery summary by party. */
export default function RecoveryPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [cityId, setCityId] = useState<string | null>(null);
  const [outstandingOnly, setOutstandingOnly] = useState(true);
  const deferredSearch = useDeferredValue(search.trim());
  const cities = useMasterOptions('cities');

  const params = new URLSearchParams();
  if (deferredSearch) params.set('search', deferredSearch);
  if (cityId) params.set('cityId', cityId);
  if (outstandingOnly) params.set('outstandingOnly', 'true');

  const { data, isPending, error } = useQuery({
    queryKey: ['recovery', 'summary', params.toString()],
    queryFn: () => api.get(`/recovery/parties?${params}`, recoverySummarySchema),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Recovery</h1>
          <p className="text-sm text-muted-foreground">
            Outstanding by party. Invoiced includes opening balances.
          </p>
        </div>
        {can('payment.create') && (
          <Button asChild>
            <Link href="/payments/new">
              <Plus /> Record payment
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search party…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64"
        />
        <div className="w-48">
          <Combobox
            options={toComboboxOptions(cities.data)}
            value={cityId}
            onChange={setCityId}
            placeholder="All cities"
            noneLabel="All cities"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={outstandingOnly}
            onChange={(e) => setOutstandingOnly(e.target.checked)}
          />
          Only parties that owe
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Party</TableHead>
              <TableHead className="hidden md:table-cell">City</TableHead>
              <TableHead className="text-right">Invoiced</TableHead>
              <TableHead className="text-right">Recovered</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="hidden text-right sm:table-cell">% Recovered</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Last payment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isPending || error || data?.data.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {isPending ? 'Loading…' : error ? error.message : 'No parties match.'}
                </TableCell>
              </TableRow>
            )}
            {data?.data.map((r) => {
              const owes = dec(r.outstanding);
              return (
                <TableRow
                  key={r.party.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/recovery/${r.party.id}`)}
                >
                  <TableCell className="font-medium">
                    <Link href={`/recovery/${r.party.id}`} onClick={(e) => e.stopPropagation()}>
                      {r.party.name}
                    </Link>
                    {!r.isActive && (
                      <span className="ml-2 text-xs text-muted-foreground">inactive</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{r.city?.name ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPKR2(r.invoiced)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPKR2(r.recovered)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-semibold tabular-nums',
                      owes.lt(0) && 'text-emerald-600 dark:text-emerald-400',
                    )}
                    title={owes.lt(0) ? 'Paid in advance' : undefined}
                  >
                    {formatPKR2(r.outstanding)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <RecoveryBar rate={r.recoveryRate} />
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">
                    {r.lastPaymentDate?.split('-').reverse().join('-') ?? '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {data && data.data.length > 0 && (
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell>Total · {data.totals.parties} parties</TableCell>
                <TableCell className="hidden md:table-cell" />
                <TableCell className="text-right tabular-nums">
                  {formatPKR2(data.totals.invoiced)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPKR2(data.totals.recovered)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPKR2(data.totals.outstanding)}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <RecoveryBar rate={data.totals.recoveryRate} />
                </TableCell>
                <TableCell className="hidden lg:table-cell" />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
