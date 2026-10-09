'use client';

import { invoiceDetailSchema, settingsSchema } from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from './api';

/** The invoice for the `[id]` route segment. */
export function useInvoice() {
  const { id } = useParams<{ id: string }>();
  return useQuery({
    queryKey: ['invoices', 'detail', id],
    queryFn: () => api.get(`/invoices/${id}`, invoiceDetailSchema),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings', settingsSchema),
    staleTime: 5 * 60_000,
  });
}
