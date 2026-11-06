'use client';

import { slipDetailSchema, slipListSchema, type SlipStatus } from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import type { BadgeVariant } from '@/components/ui/badge';
import { api } from './api';

export const SLIPS_KEY = ['payment-slips'] as const;

export function useSlips(status: SlipStatus | '') {
  return useQuery({
    queryKey: [...SLIPS_KEY, 'list', status],
    queryFn: () =>
      api.get(`/payment-slips?pageSize=100${status ? `&status=${status}` : ''}`, slipListSchema),
  });
}

export function useSlip(id: string) {
  return useQuery({
    queryKey: [...SLIPS_KEY, 'detail', id],
    queryFn: () => api.get(`/payment-slips/${id}`, slipDetailSchema),
  });
}

export const SLIP_STATUS: Record<SlipStatus, { label: string; variant: BadgeVariant }> = {
  TO_CONFIRM: { label: 'To confirm', variant: 'warning' },
  SAVED: { label: 'Saved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
};

export const slipFileUrl = (id: string) => `/api/v1/payment-slips/${id}/file`;

/** Longest side of an uploaded photo; phone photos are larger than the 4 MB upload limit. */
const MAX_SIDE = 2000;

/**
 * Shrinks a large photo to a JPEG the server accepts. PDFs, small images and formats the
 * browser can't draw (e.g. HEIC on some phones) are sent as they are.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 1_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
