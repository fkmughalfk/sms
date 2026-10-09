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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ShareBar } from './figures';

export interface ExtraColumn<Row> {
  header: string;
  cell: (row: Row) => ReactNode;
  className?: string;
}

/**
 * "Sales by …" table (spec §5.5): Qty (Packs), Weight (KG), Amount, Commission,
 * % of Sales and a share bar. The share bar is the bar chart; the numbers are the table view.
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
  const shown = limit ? rows.slice(0, limit) : rows;
  const max = rows.reduce((m, r) => (dec(r.pctOfSales).gt(m) ? dec(r.pctOfSales) : m), dec(0));
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{label}</TableHead>
            {extra.map((c) => (
              <TableHead key={c.header} className={c.className}>
                {c.header}
              </TableHead>
            ))}
            <TableHead className="text-right">Packs</TableHead>
            <TableHead className="hidden text-right md:table-cell">Weight (KG)</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Commission</TableHead>
            <TableHead className="text-right">% of sales</TableHead>
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
  );
}
