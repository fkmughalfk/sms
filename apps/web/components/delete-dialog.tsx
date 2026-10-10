'use client';

import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { api, ApiError } from '@/lib/api';

/**
 * Confirm → `DELETE path` → toast. The server decides what may go: a record in use comes
 * back as 409 "Deactivate it instead", which is shown as the error toast.
 */
export function DeleteDialog({
  path,
  title,
  description,
  successMessage,
  invalidate,
  onOpenChange,
  onDeleted,
}: {
  /** API path of the record, or null when closed. */
  path: string | null;
  title: string;
  description?: ReactNode;
  successMessage: string;
  invalidate: QueryKey[];
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (p: string) => api.delete(p, z.undefined()),
    onSuccess: () => {
      toast.success(successMessage);
      for (const queryKey of invalidate) void queryClient.invalidateQueries({ queryKey });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : 'Could not delete.');
      onOpenChange(false);
    },
  });

  return (
    <ConfirmDialog
      open={path !== null}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel="Delete"
      destructive
      busy={remove.isPending}
      onConfirm={() => path && remove.mutate(path)}
    />
  );
}
