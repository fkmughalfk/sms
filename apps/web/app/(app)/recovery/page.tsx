'use client';

import { dec, formatPKR2, formatPercent, recoverySummarySchema } from '@sms/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen, HandCoins, Plus, Receipt } from 'lucide-react';
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
import { SortableHead } from '@/components/data-table/sortable-head';
import { TablePagination } from '@/components/data-table/table-pagination';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';
import { useTableState } from '@/lib/use-table';
import { cn } from '@/lib/utils';
import { PageHeading } from '@/components/form-section';
import { FilterBar } from '@/components/data-table/filter-bar';
import { RowActions } from '@/components/data-table/row-actions';

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

  const filterQuery = new URLSearchParams();
  if (deferredSearch) filterQuery.set('search', deferredSearch);
  if (cityId) filterQuery.set('cityId', cityId);
  if (outstandingOnly) filterQuery.set('outstandingOnly', 'true');
  const table = useTableState({ sort: 'outstanding:desc', resetOn: filterQuery.toString() });
  const params = table.apply(new URLSearchParams(filterQuery));

  const { data, isPending, error } = useQuery({
    queryKey: ['recovery', 'summary', params.toString()],
    queryFn: () => api.get(`/recovery/parties?${params}`, recoverySummarySchema),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageHeading icon={Receipt} tone="rose">
            Recovery
          </PageHeading>
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

      <FilterBar tone="rose" className="flex flex-wrap items-center gap-2">
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
            className="size-4 accent-rose-500"
            checked={outstandingOnly}
            onChange={(e) => setOutstandingOnly(e.target.checked)}
          />
          Only parties that owe
        </label>
      </FilterBar>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead field="party" sort={table.sort} onSort={table.toggleSort}>
                Party
              </SortableHead>
              <SortableHead
                field="city"
                sort={table.sort}
                onSort={table.toggleSort}
                className="hidden md:table-cell"
              >
                City
              </SortableHead>
              <SortableHead
                field="invoiced"
                sort={table.sort}
                onSort={table.toggleSort}
                firstDir="desc"
                align="right"
              >
                Invoiced
              </SortableHead>
              <SortableHead
                field="recovered"
                sort={table.sort}
                onSort={table.toggleSort}
                firstDir="desc"
                align="right"
              >
                Recovered
              </SortableHead>
              <SortableHead
                field="outstanding"
                sort={table.sort}
                onSort={table.toggleSort}
                firstDir="desc"
                align="right"
              >
                Outstanding
              </SortableHead>
              <SortableHead
                field="recoveryRate"
                sort={table.sort}
                onSort={table.toggleSort}
                firstDir="desc"
                align="right"
                className="hidden sm:table-cell"
              >
                % Recovered
              </SortableHead>
              <SortableHead
                field="lastPaymentDate"
                sort={table.sort}
                onSort={table.toggleSort}
                firstDir="desc"
                align="right"
                className="hidden lg:table-cell"
              >
                Last payment
              </SortableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isPending || error || data?.data.length === 0) && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
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
                  <TableCell>
                    <RowActions
                      label={r.party.name}
                      actions={[
                        {
                          label: 'View ledger',
                          icon: BookOpen,
                          onSelect: () => router.push(`/recovery/${r.party.id}`),
                        },
                        {
                          label: 'Record payment',
                          icon: HandCoins,
                          onSelect: () => router.push('/payments/new'),
                          show: can('payment.create'),
                        },
                      ]}
                    />
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
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {data && (
        <TablePagination
          page={table.page}
          pageSize={table.pageSize}
          total={data.meta.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          noun="parties"
        />
      )}
    </div>
  );
}
