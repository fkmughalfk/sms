'use client';

import {
  dec,
  formatNumber,
  type RateBasis,
  type RateListLine,
  type RateListStatus,
  rateListDetailSchema,
  rateListPageSchema,
} from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import type { BadgeVariant } from '@/components/ui/badge';
import { api, ApiError } from './api';

export const RATE_LISTS_KEY = ['rate-lists'] as const;

export function useRateLists(page = 1) {
  return useQuery({
    queryKey: [...RATE_LISTS_KEY, 'page', page],
    queryFn: () => api.get(`/rate-lists?page=${page}&pageSize=50`, rateListPageSchema),
  });
}

export function useRateList(id: string) {
  return useQuery({
    queryKey: [...RATE_LISTS_KEY, 'detail', id],
    queryFn: () => api.get(`/rate-lists/${id}`, rateListDetailSchema),
  });
}

/** The list in force now; `null` when none has started yet (404). */
export function useCurrentRateList() {
  return useQuery({
    queryKey: [...RATE_LISTS_KEY, 'current'],
    queryFn: () =>
      api.get('/rate-lists/current', rateListDetailSchema).catch((e: unknown) => {
        if (e instanceof ApiError && e.statusCode === 404) return null;
        throw e;
      }),
  });
}

export const STATUS_BADGE: Record<RateListStatus, { label: string; variant: BadgeVariant }> = {
  CURRENT: { label: 'Current', variant: 'success' },
  UPCOMING: { label: 'Upcoming', variant: 'info' },
  PAST: { label: 'Past', variant: 'secondary' },
};

export const BASIS_LABEL: Record<RateBasis, string> = {
  PER_40KG: 'per 40 kg',
  PER_UNIT: 'per pack',
};

/** "11,300" / "2,550.5": thousands separators, the rate's own decimals. */
export function formatRate(rate: string): string {
  return formatNumber(rate, dec(rate).decimalPlaces());
}

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC', // the value is already Karachi local time
});

/** `2026-11-04T09:00` (Karachi) → "04 Nov 2026, 09:00 am". */
export function formatEffective(local: string): string {
  return dateTimeFmt.format(new Date(`${local}:00Z`));
}

/** "2025-2026" → "25-26", as on the printed list. */
export const shortCropYear = (cropYear: string | null) =>
  cropYear ? `${cropYear.slice(2, 4)}-${cropYear.slice(7, 9)}` : '';

export interface RateChange {
  /** Signed difference, formatted ("+300", "−200"). */
  text: string;
  direction: 'up' | 'down' | 'same' | 'new';
}

/** Change against the previous list's rate (null when there is nothing to compare). */
export function rateChange(rate: string | null, previous: string | null): RateChange | null {
  if (rate === null) return null;
  if (previous === null) return { text: 'new', direction: 'new' };
  const diff = dec(rate).minus(previous);
  if (diff.isZero()) return { text: '—', direction: 'same' };
  const abs = formatRate(diff.abs().toString());
  return diff.isPositive()
    ? { text: `+${abs}`, direction: 'up' }
    : { text: `−${abs}`, direction: 'down' };
}

/** Lines grouped by category, in first-seen order (the API orders rice, pulses, … by product #). */
export function groupByCategory<T extends Pick<RateListLine, 'product'>>(
  lines: T[],
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const l of lines) {
    const g = groups.get(l.product.category);
    if (g) g.push(l);
    else groups.set(l.product.category, [l]);
  }
  return [...groups];
}
