'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Pencil, Tags, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeading } from '@/components/form-section';
import { RateListLines } from '@/components/rate-list/rate-list-lines';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatEffective, RATE_LISTS_KEY, STATUS_BADGE, useRateList } from '@/lib/rate-lists';

export default function RateListPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const list = useRateList(id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = useMutation({
    mutationFn: () => api.delete(`/rate-lists/${id}`, z.undefined()),
    onSuccess: () => {
      toast.success('Rate list deleted.');
      void queryClient.invalidateQueries({ queryKey: RATE_LISTS_KEY });
      router.push('/rates');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete.'),
  });

  if (list.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (list.error) return <p className="text-sm text-destructive">{list.error.message}</p>;
  const l = list.data;
  const badge = STATUS_BADGE[l.status];

  return (
    <div className="grid gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link href="/rates">
            <ArrowLeft /> Rate lists
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <PageHeading icon={Tags} tone="amber">
              {formatEffective(l.effectiveFrom)}
            </PageHeading>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={badge.variant}>{badge.label}</Badge>
              {l.availableCount} on sale · {l.itemCount - l.availableCount} N/A
              {l.createdBy && ` · by ${l.createdBy}`}
              {l.previous && ` · changes vs ${formatEffective(l.previous.effectiveFrom)}`}
            </p>
          </div>
          {can('rateList.manage') && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/rates/new?from=${l.id}`}>
                  <Copy /> New from this
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/rates/${l.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete
              </Button>
            </div>
          )}
        </div>
      </div>
      {l.remarks && <p className="text-sm">{l.remarks}</p>}
      <RateListLines lines={l.items} showChange={!!l.previous} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this rate list?"
        description="It is removed for good (the audit log keeps a copy). If it is the current list, the one before it becomes current."
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
