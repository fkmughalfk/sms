'use client';

import { BULK_MAX } from '@sms/shared';
import { useState } from 'react';
import { z } from 'zod';
import { api } from '@/lib/api';

/**
 * Row selection for bulk actions. Selection survives paging (so "select all N" works) and
 * clears when `resetKey` — the list's filter query — changes.
 */
export function useSelection(pageIds: string[], resetKey: string) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    // Filters changed: the old selection may no longer be visible. Reset during render.
    setKey(resetKey);
    setSelected(new Set());
  }

  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = !allOnPage && pageIds.some((id) => selected.has(id));

  return {
    selected,
    count: selected.size,
    has: (id: string) => selected.has(id),
    allOnPage,
    someOnPage,
    toggle: (id: string) =>
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    togglePage: () =>
      setSelected((s) => {
        const next = new Set(s);
        if (allOnPage) for (const id of pageIds) next.delete(id);
        else for (const id of pageIds) next.add(id);
        return next;
      }),
    selectIds: (ids: string[]) => setSelected(new Set(ids)),
    clear: () => setSelected(new Set()),
  };
}

export type Selection = ReturnType<typeof useSelection>;

const idPageSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
  meta: z.object({ total: z.number() }),
});

/** Every id matching a list's filters (for "select all N"), capped at `BULK_MAX`. */
export async function fetchAllIds(path: string, filters: URLSearchParams): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ids.length < BULK_MAX; page++) {
    const params = new URLSearchParams(filters);
    params.set('page', String(page));
    params.set('pageSize', '500');
    const res = await api.get(`${path}?${params}`, idPageSchema);
    ids.push(...res.data.map((r) => r.id));
    if (res.data.length === 0 || ids.length >= res.meta.total) break;
  }
  return ids.slice(0, BULK_MAX);
}
