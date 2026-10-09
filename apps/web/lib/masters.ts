'use client';

import { dec, masterOptionsSchema } from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { ComboboxOption } from '@/components/combobox';
import { api } from './api';

/** Query key prefix for a master; invalidating it refreshes lists and dropdowns. */
export const masterKey = (path: string) => ['masters', path] as const;

/** Active rows for a dropdown (`GET /x/options`). */
export function useMasterOptions<T extends { id: string; name: string }>(
  path: string,
  schema: z.ZodType<T[]> = masterOptionsSchema as unknown as z.ZodType<T[]>,
  query = '',
) {
  return useQuery({
    queryKey: [...masterKey(path), 'options', query],
    queryFn: () => api.get(`/${path}/options${query}`, schema),
    staleTime: 60_000,
  });
}

/**
 * Dropdown options, keeping the record's current value visible even if it has since
 * been deactivated (deactivated masters stay on old data — spec §4.1).
 */
export function toComboboxOptions(
  rows: { id: string; name: string }[] | undefined,
  current?: { id: string; name: string } | null,
): ComboboxOption[] {
  const options = (rows ?? []).map((r) => ({ value: r.id, label: r.name }));
  if (current && !options.some((o) => o.value === current.id)) {
    options.unshift({ value: current.id, label: `${current.name} (inactive)` });
  }
  return options;
}

const PERCENT_RE = /^\d+(\.\d{1,4})?$/;

/**
 * Commission rate typed as a percentage ("0.35") → stored fraction ("0.0035").
 * Blank → null (= inherit from category / settings).
 */
export const percentRateSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ?? '').trim())
  .superRefine((v, ctx) => {
    if (v === '') return;
    if (!PERCENT_RE.test(v) || dec(v).gt(100)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a percentage between 0 and 100 (e.g. 0.35).',
      });
    }
  })
  .transform((v) => (v === '' ? null : dec(v).div(100).toString()));

/** Stored fraction → percentage text for the form ("0.0035" → "0.35"). */
export const rateToPercent = (rate: string | null | undefined) =>
  rate == null ? '' : dec(rate).times(100).toString();
