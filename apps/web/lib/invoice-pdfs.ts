'use client';

import { pdfImportDetailSchema, pdfImportListSchema, type PdfImportStatus } from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import type { BadgeVariant } from '@/components/ui/badge';
import { api } from './api';

export const PDFS_KEY = ['invoice-pdfs'] as const;

export function usePdfImports(status: PdfImportStatus | '', page = 1) {
  return useQuery({
    queryKey: [...PDFS_KEY, 'list', status, page],
    queryFn: () =>
      api.get(
        `/invoice-pdfs?page=${page}&pageSize=50${status ? `&status=${status}` : ''}`,
        pdfImportListSchema,
      ),
  });
}

export function usePdfImport(id: string) {
  return useQuery({
    queryKey: [...PDFS_KEY, 'detail', id],
    queryFn: () => api.get(`/invoice-pdfs/${id}`, pdfImportDetailSchema),
  });
}

export const PDF_STATUS: Record<PdfImportStatus, { label: string; variant: BadgeVariant }> = {
  POSTED: { label: 'Posted', variant: 'success' },
  NEEDS_REVIEW: { label: 'Needs review', variant: 'warning' },
  DUPLICATE: { label: 'Duplicate', variant: 'secondary' },
  FAILED: { label: 'Unreadable', variant: 'danger' },
};

/** The original PDF, opened through the same-origin API rewrite (cookies included). */
export const pdfFileUrl = (id: string) => `/api/v1/invoice-pdfs/${id}/file`;
