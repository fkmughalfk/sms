'use client';

import {
  businessMonth,
  businessToday,
  eachDay,
  fiscalYearRange,
  monthRange,
  type Settings,
} from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { z } from 'zod';
import { api } from './api';

export type PresetId = 'fy' | 'last-fy' | 'month' | 'last-month' | 'custom';

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'fy', label: 'This fiscal year' },
  { id: 'month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'last-fy', label: 'Last fiscal year' },
  { id: 'custom', label: 'Custom range' },
];

export interface Period {
  preset: PresetId;
  from: string;
  to: string;
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Resolves a preset to dates in Asia/Karachi (spec §5.5: default = current fiscal year). */
export function presetRange(preset: Exclude<PresetId, 'custom'>, fyStartMonth: number) {
  const today = businessToday();
  switch (preset) {
    case 'fy':
      return fiscalYearRange(today, fyStartMonth);
    case 'last-fy': {
      const { from } = fiscalYearRange(today, fyStartMonth);
      const [y] = from.split('-');
      return fiscalYearRange(`${Number(y) - 1}${from.slice(4)}`, fyStartMonth);
    }
    case 'month':
      return monthRange(businessMonth());
    case 'last-month':
      return monthRange(shiftMonth(businessMonth(), -1));
  }
}

/** The dashboard/report period, kept in the URL (`?period=&from=&to=`) so it survives navigation. */
export function usePeriod(settings: Settings | undefined) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fyStart = settings?.fiscalYearStartMonth ?? 1;

  const preset = (params.get('period') as PresetId | null) ?? 'fy';
  const range =
    preset === 'custom'
      ? {
          from: params.get('from') ?? presetRange('fy', fyStart).from,
          to: params.get('to') ?? businessToday(),
        }
      : presetRange(preset, fyStart);
  const period: Period = { preset, ...range };

  const setPeriod = useCallback(
    (next: { preset: PresetId; from?: string; to?: string }) => {
      // Keep other parameters (e.g. the Reports tab).
      const q = new URLSearchParams(params);
      q.set('period', next.preset);
      if (next.preset === 'custom') {
        q.set('from', next.from ?? range.from);
        q.set('to', next.to ?? range.to);
      } else {
        q.delete('from');
        q.delete('to');
      }
      router.replace(`${pathname}?${q}`, { scroll: false });
    },
    [params, router, pathname, range.from, range.to],
  );

  return { period, setPeriod };
}

/** A report endpoint for the period; keeps the previous render while refetching. */
export function useReport<T>(name: string, schema: z.ZodType<T>, period: Period, extra = '') {
  return useQuery({
    queryKey: ['reports', name, period.from, period.to, extra],
    queryFn: () => api.get(`/reports/${name}?from=${period.from}&to=${period.to}${extra}`, schema),
    placeholderData: (prev) => prev,
  });
}

/** Days in a period — daily trend for short ranges, monthly otherwise. */
export const periodDays = (p: Period) => eachDay(p.from, p.to).length;
