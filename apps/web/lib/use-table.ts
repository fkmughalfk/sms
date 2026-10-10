'use client';

import { dec } from '@sms/shared';
import { useCallback, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export const parseSort = (sort: string): { field: string; dir: SortDir } => {
  const [field = '', dir] = sort.split(':');
  return { field, dir: dir === 'desc' ? 'desc' : 'asc' };
};

export const PAGE_SIZES = [25, 50, 100, 200] as const;

/**
 * Page, page size and sort for a list (`?page&pageSize&sort=field:dir`, spec §7).
 * Changing the sort or page size — or calling `resetPage` from a filter — goes back to page 1.
 */
export function useTableState(defaults: {
  sort: string;
  pageSize?: number;
  /** Any value that, when it changes, should send the list back to page 1 (e.g. filters). */
  resetOn?: string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaults.pageSize ?? 50);
  const [sort, setSort] = useState(defaults.sort);

  // Filters changed → back to page 1 (React's "adjust state when a prop changes" pattern).
  const [lastReset, setLastReset] = useState(defaults.resetOn);
  if (defaults.resetOn !== lastReset) {
    setLastReset(defaults.resetOn);
    setPage(1);
  }

  /** Click on a column: same column flips direction, a new one starts at `firstDir`. */
  const toggleSort = useCallback((field: string, firstDir: SortDir = 'asc') => {
    setSort((current) => {
      const cur = parseSort(current);
      return cur.field === field
        ? `${field}:${cur.dir === 'asc' ? 'desc' : 'asc'}`
        : `${field}:${firstDir}`;
    });
    setPage(1);
  }, []);

  const setPageSize = useCallback((n: number) => {
    setPageSizeState(n);
    setPage(1);
  }, []);

  const resetPage = useCallback(() => setPage(1), []);

  /** Adds page/pageSize/sort to a query string. */
  const apply = (params: URLSearchParams) => {
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    params.set('sort', sort);
    return params;
  };

  return { page, setPage, pageSize, setPageSize, sort, toggleSort, resetPage, apply };
}

export type TableState = ReturnType<typeof useTableState>;

export interface ClientColumn<T> {
  value: (row: T) => string | number | null | undefined;
  /** Compare as exact decimals (amounts, rates) instead of text. */
  numeric?: boolean;
}

/**
 * Sorts and pages rows in the browser — for small, already-aggregated report tables.
 * Empty values sort last in both directions.
 */
export function sortAndPage<T>(
  rows: readonly T[],
  sort: string,
  columns: Record<string, ClientColumn<T>>,
  page: number,
  pageSize: number,
): T[] {
  const { field, dir } = parseSort(sort);
  const col = columns[field];
  const sorted = col
    ? [...rows].sort((a, b) => {
        const va = col.value(a);
        const vb = col.value(b);
        if (va == null || va === '') return vb == null || vb === '' ? 0 : 1;
        if (vb == null || vb === '') return -1;
        const c = col.numeric
          ? dec(String(va)).comparedTo(String(vb))
          : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
        return dir === 'asc' ? c : -c;
      })
    : [...rows];
  return sorted.slice((page - 1) * pageSize, page * pageSize);
}
