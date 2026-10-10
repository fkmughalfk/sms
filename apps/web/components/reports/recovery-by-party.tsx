'use client';

import { dec, formatPercent, formatPKR2, type PartySales } from '@sms/shared';
import Link from 'next/link';
import { OptionalSortableHead } from '@/components/data-table/sortable-head';
import { TablePagination } from '@/components/data-table/table-pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type ClientColumn, sortAndPage, useTableState } from '@/lib/use-table';
import { cn } from '@/lib/utils';
import { ShareBar } from './figures';

type Row = PartySales['data'][number];

const COLUMNS: Record<string, ClientColumn<Row>> = {
  name: { value: (r) => r.name },
  amount: { value: (r) => r.amount, numeric: true },
  recovered: { value: (r) => r.recovered, numeric: true },
  outstanding: { value: (r) => r.outstanding, numeric: true },
  lastPaymentDate: { value: (r) => r.lastPaymentDate },
  recoveryRate: { value: (r) => r.recoveryRate, numeric: true },
};

/**
 * Dashboard "Recovery by Party" (rows 96+): period invoiced vs recovered per party.
 * With `limit` (dashboard) the top N by sales; without it (Reports page) sortable and paged.
 */
export function RecoveryByParty({ data, limit }: { data: PartySales; limit?: number }) {
  const interactive = limit === undefined;
  const table = useTableState({ sort: 'outstanding:desc', pageSize: 25 });
  const rows = interactive
    ? sortAndPage(data.data, table.sort, COLUMNS, table.page, table.pageSize)
    : data.data.slice(0, limit);

  const sortable = interactive ? table : null;

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <OptionalSortableHead table={sortable} field="name">
                Party
              </OptionalSortableHead>
              <OptionalSortableHead table={sortable} field="amount" numeric align="right">
                Invoiced
              </OptionalSortableHead>
              <OptionalSortableHead table={sortable} field="recovered" numeric align="right">
                Recovered
              </OptionalSortableHead>
              <OptionalSortableHead table={sortable} field="outstanding" numeric align="right">
                Outstanding
              </OptionalSortableHead>
              <OptionalSortableHead
                table={sortable}
                field="lastPaymentDate"
                numeric
                align="right"
                className="hidden md:table-cell"
              >
                Last payment
              </OptionalSortableHead>
              <OptionalSortableHead table={sortable} field="recoveryRate" numeric align="right">
                % recovered
              </OptionalSortableHead>
              <TableHead className="hidden w-32 sm:table-cell">
                <span className="sr-only">Share recovered</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No invoices or payments in this period.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id ?? r.name}>
                <TableCell className="font-sans">
                  {r.id ? (
                    <Link href={`/recovery/${r.id}`} className="hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                </TableCell>
                <TableCell className="text-right">{formatPKR2(r.amount)}</TableCell>
                <TableCell className="text-right">{formatPKR2(r.recovered)}</TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium',
                    dec(r.outstanding).lt(0) && 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {formatPKR2(r.outstanding)}
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  {r.lastPaymentDate?.split('-').reverse().join('-') ?? '—'}
                </TableCell>
                <TableCell className="text-right">{formatPercent(r.recoveryRate, 1)}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <ShareBar ratio={r.recoveryRate} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {interactive && data.data.length > 0 && (
        <TablePagination
          page={table.page}
          pageSize={table.pageSize}
          total={data.data.length}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          noun="parties"
        />
      )}
      {limit && data.data.length > limit && (
        <p className="text-xs text-muted-foreground">
          Top {limit} of {data.data.length} parties by sales.
        </p>
      )}
    </div>
  );
}
