'use client';

import { rateListDraftSchema, type RateListLine } from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import { Tags } from 'lucide-react';
import { useParams } from 'next/navigation';
import { PageHeading } from '@/components/form-section';
import { RateListForm } from '@/components/rate-list/rate-list-form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatEffective, RATE_LISTS_KEY, useRateList } from '@/lib/rate-lists';

/** Edit: the list's own lines, plus any active product it lacks (as N/A) so it can be added. */
export default function EditRateListPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const list = useRateList(id);
  const draft = useQuery({
    queryKey: [...RATE_LISTS_KEY, 'draft', id],
    queryFn: () => api.get(`/rate-lists/draft?from=${id}`, rateListDraftSchema),
    enabled: can('rateList.manage'),
    gcTime: 0,
  });

  if (!can('rateList.manage')) {
    return <p className="text-sm text-muted-foreground">Only the office can edit rate lists.</p>;
  }
  if (list.isPending || draft.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (list.error || draft.error) {
    return <p className="text-sm text-destructive">{(list.error ?? draft.error)?.message}</p>;
  }
  const onList = new Set(list.data.items.map((l) => l.productId));
  const extra: RateListLine[] = draft.data.items.filter((l) => !onList.has(l.productId));

  return (
    <div className="grid gap-5">
      <PageHeading icon={Tags} tone="amber">
        Edit rate list · {formatEffective(list.data.effectiveFrom)}
      </PageHeading>
      <RateListForm existingId={id} initial={list.data} lines={[...list.data.items, ...extra]} />
    </div>
  );
}
