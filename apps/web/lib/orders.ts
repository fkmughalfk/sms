'use client';

import {
  calcOrderLine,
  calcOrderTotals,
  dec,
  type OrderStatus,
  orderDetailSchema,
  orderListSchema,
  type RateListLine,
} from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import type { BadgeVariant } from '@/components/ui/badge';
import { api } from './api';

export const ORDERS_KEY = ['orders'] as const;

export function useOrders(query: string) {
  return useQuery({
    queryKey: [...ORDERS_KEY, 'list', query],
    queryFn: () => api.get(`/orders?${query}`, orderListSchema),
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: [...ORDERS_KEY, 'detail', id],
    queryFn: () => api.get(`/orders/${id}`, orderDetailSchema),
  });
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; variant: BadgeVariant }> = {
  SUBMITTED: { label: 'Waiting approval', variant: 'warning' },
  PENDING: { label: 'Pending', variant: 'info' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
  CLOSED: { label: 'Closed', variant: 'violet' },
};

/** `productId|cropYear` — one rate-list line / one order line. */
export const lineKey = (productId: string, cropYear: string | null | undefined) =>
  `${productId}|${cropYear ?? ''}`;

/** What a line costs on screen. The server recomputes it on save (CLAUDE.md rule 2). */
export interface LinePricing {
  basis: RateListLine['basis'];
  rate: string;
  packWeightKg: string;
  packPcs: number;
}

const QTY_RE = /^\d+$/;
const RATE_RE = /^\d+(\.\d{1,2})?$/;

/** Live line amount, or null while the qty / rate is incomplete. */
export function previewLine(p: LinePricing | null, qty: string, rateOverride = '') {
  if (!p || !QTY_RE.test(qty.trim()) || Number(qty) <= 0) return null;
  const rate = rateOverride.trim() !== '' ? rateOverride.trim() : p.rate;
  if (!RATE_RE.test(rate) || dec(rate).lte(0)) return null;
  return calcOrderLine({ ...p, rate, qtyPacks: Number(qty) });
}

export function previewTotals(
  lines: ({ amount: { toString(): string }; weightKg: { toString(): string } } | null)[],
  qtys: number[],
) {
  const done = lines
    .map((l, i) =>
      l
        ? { qtyPacks: qtys[i] ?? 0, amount: l.amount.toString(), weightKg: l.weightKg.toString() }
        : null,
    )
    .filter((l): l is NonNullable<typeof l> => !!l);
  return calcOrderTotals(done);
}

/** "150 bags" / "10 cartons" — ghee packs are cartons. */
export function packWord(packPcs: number, qty: number) {
  return packPcs > 1 ? (qty === 1 ? 'carton' : 'cartons') : qty === 1 ? 'bag' : 'bags';
}

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
/** `2026-11-04` → "04 Nov 2026". */
export const formatOrderDate = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`));
