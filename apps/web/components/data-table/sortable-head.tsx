'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { TableHead } from '@/components/ui/table';
import { parseSort, type SortDir } from '@/lib/use-table';
import { cn } from '@/lib/utils';

/**
 * A column header that sorts its table. Click toggles direction; numeric columns start
 * high-to-low (`firstDir="desc"`). `aria-sort` tells screen readers the current order.
 */
export function SortableHead({
  field,
  sort,
  onSort,
  firstDir = 'asc',
  align = 'left',
  className,
  children,
}: {
  field: string;
  sort: string;
  onSort: (field: string, firstDir: SortDir) => void;
  firstDir?: SortDir;
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}) {
  const current = parseSort(sort);
  const active = current.field === field;
  const Icon = !active ? ArrowUpDown : current.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={cn(align === 'right' && 'text-right', className)}
      aria-sort={active ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(field, firstDir)}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          align === 'right' && 'flex-row-reverse',
          active && 'text-foreground',
        )}
      >
        {children}
        <Icon className={cn('size-3.5 shrink-0', !active && 'opacity-40')} aria-hidden />
      </button>
    </TableHead>
  );
}

/** A header that sorts when `table` is given (Reports page) and is plain otherwise (dashboard). */
export function OptionalSortableHead({
  table,
  field,
  numeric,
  align,
  className,
  children,
}: {
  table: { sort: string; toggleSort: (field: string, firstDir: SortDir) => void } | null;
  field?: string;
  numeric?: boolean;
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}) {
  if (table && field) {
    return (
      <SortableHead
        field={field}
        sort={table.sort}
        onSort={table.toggleSort}
        firstDir={numeric ? 'desc' : 'asc'}
        align={align}
        className={className}
      >
        {children}
      </SortableHead>
    );
  }
  return (
    <TableHead className={cn(align === 'right' && 'text-right', className)}>{children}</TableHead>
  );
}
