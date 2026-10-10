'use client';

import {
  dec,
  formatCommission,
  formatKg,
  formatPercent,
  formatPKR,
  formatQty,
  type SalesRow,
} from '@sms/shared';
import type { ReactNode } from 'react';
import { OptionalSortableHead } from '@/components/data-table/sortable-head';
import { TablePagination } from '@/components/data-table/table-pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type ClientColumn, sortAndPage, useTableState } from '@/lib/use-table';
import { ShareBar } from './figures';

export interface ExtraColumn<Row> {
  header: string;
  cell: (row: Row) => ReactNode;
  className?: string;
  /** Makes the column sortable on the Reports page. */
  sortValue?: (row: Row) => string | number | null;
  numeric?: boolean;
}

/**
 * "Sales by …" table (spec §5.5): Qty (Packs), Weight (KG), Amount, Commission,
 * % of Sales and a share bar. The share bar is the bar chart; the numbers are the table view.
 *
 * With `limit` (dashboard) it shows the top N by amount. Without it (Reports page) every
 * column sorts and the rows page — in the browser, since these sets are already aggregated.
 */
export function SalesTable<Row extends SalesRow>({
  rows,
  totals,
  label,
  extra = [],
  limit,
  empty = 'No sales in this period.',
}: {
  rows: Row[];
  totals?: { packs: number; weightKg: string; amount: string; commission: string };
  label: string;
  extra?: ExtraColumn<Row>[];
  /** Show only the first N rows (the rest are on the Reports page). */
  limit?: number;
  empty?: string;
}) {
  const interactive = limit === undefined;
  const table = useTableState({ sort: 'amount:desc', pageSize: 25 });

  const columns: Record<string, ClientColumn<Row>> = {
    name: { value: (r) => r.name },
    packs: { value: (r) => r.packs, numeric: true },
    weightKg: { value: (r) => r.weightKg, numeric: true },
    amount: { value: (r) => r.amount, numeric: true },
    commission: { value: (r) => r.commission, numeric: true },
    pctOfSales: { value: (r) => r.pctOfSales, numeric: true },
  };
  extra.forEach((c, i) => {
    if (c.sortValue) columns[`extra${i}`] = { value: c.sortValue, numeric: c.numeric };
  });

  const shown = interactive
    ? sortAndPage(rows, table.sort, columns, table.page, table.pageSize)
    : rows.slice(0, limit);
  const max = rows.reduce((m, r) => (dec(r.pctOfSales).gt(m) ? dec(r.pctOfSales) : m), dec(0));

  const sortable = interactive ? table : null;

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <OptionalSortableHead table={sortable} field="name">
                {label}
              </OptionalSortableHead>
              {extra.map((c, i) => (
                <OptionalSortableHead
                  table={sortable}
                  key={c.header}
                  field={c.sortValue ? `extra${i}` : undefined}
                  numeric={c.numeric}
                  className={c.className}
                >
                  {c.header}
                </OptionalSortableHead>
              ))}
              <OptionalSortableHead table={sortable} field="packs" numeric align="right">
                Packs
              </OptionalSortableHead>
              <OptionalSortableHead
                table={sortable}
                field="weightKg"
                numeric
                align="right"
                className="hidden md:table-cell"
              >
                Weight (KG)
              </OptionalSortableHead>
              <OptionalSortableHead table={sortable} field="amount" numeric align="right">
                Amount
              </OptionalSortableHead>
              <OptionalSortableHead
                table={sortable}
                field="commission"
                numeric
                align="right"
                className="hidden lg:table-cell"
              >
                Commission
              </OptionalSortableHead>
              <OptionalSortableHead table={sortable} field="pctOfSales" numeric align="right">
                % of sales
              </OptionalSortableHead>
              <TableHead className="hidden w-32 sm:table-cell">
                <span className="sr-only">Share</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={8 + extra.length} className="text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            )}
            {shown.map((r) => (
              <TableRow key={r.id ?? r.name}>
                <TableCell className="font-sans">{r.name}</TableCell>
                {extra.map((c) => (
                  <TableCell key={c.header} className={c.className}>
                    {c.cell(r)}
                  </TableCell>
                ))}
                <TableCell className="text-right">{formatQty(r.packs)}</TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  {formatKg(r.weightKg)}
                </TableCell>
                <TableCell className="text-right font-medium">{formatPKR(r.amount)}</TableCell>
                <TableCell className="hidden text-right lg:table-cell">
                  {formatCommission(r.commission)}
                </TableCell>
                <TableCell className="text-right">{formatPercent(r.pctOfSales, 1)}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  {/* Scaled to the largest row so small shares stay visible. */}
                  <ShareBar ratio={max.isZero() ? 0 : dec(r.pctOfSales).div(max)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {totals && shown.length > 0 && (
            <TableFooter className="tabular-nums">
              <TableRow className="font-semibold">
                <TableCell>
                  Total
                  {limit && rows.length > limit ? (
                    <span className="ml-1 font-normal text-muted-foreground">
                      (all {rows.length}; top {limit} shown)
                    </span>
                  ) : null}
                </TableCell>
                {extra.map((c) => (
                  <TableCell key={c.header} />
                ))}
                <TableCell className="text-right">{formatQty(totals.packs)}</TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  {formatKg(totals.weightKg)}
                </TableCell>
                <TableCell className="text-right">{formatPKR(totals.amount)}</TableCell>
                <TableCell className="hidden text-right lg:table-cell">
                  {formatCommission(totals.commission)}
                </TableCell>
                <TableCell className="text-right">100%</TableCell>
                <TableCell className="hidden sm:table-cell" />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      {interactive && rows.length > 0 && (
        <TablePagination
          page={table.page}
          pageSize={table.pageSize}
          total={rows.length}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
        />
      )}
    </div>
  );
}
