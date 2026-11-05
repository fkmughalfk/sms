'use client';

import { rateListDraftSchema } from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import { Tags } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeading } from '@/components/form-section';
import { RateListForm } from '@/components/rate-list/rate-list-form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatEffective, RATE_LISTS_KEY } from '@/lib/rate-lists';

function NewRateList() {
  const from = useSearchParams().get('from');
  const { can } = useAuth();
  const draft = useQuery({
    queryKey: [...RATE_LISTS_KEY, 'draft', from],
    queryFn: () => api.get(`/rate-lists/draft${from ? `?from=${from}` : ''}`, rateListDraftSchema),
    enabled: can('rateList.manage'),
    gcTime: 0,
  });

  if (!can('rateList.manage')) {
    return <p className="text-sm text-muted-foreground">Only the office can publish rate lists.</p>;
  }
  if (draft.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (draft.error) return <p className="text-sm text-destructive">{draft.error.message}</p>;
  return (
    <RateListForm
      lines={draft.data.items}
      copiedFrom={
        draft.data.copiedFrom ? formatEffective(draft.data.copiedFrom.effectiveFrom) : null
      }
    />
  );
}

export default function NewRateListPage() {
  return (
    <div className="grid gap-5">
      <PageHeading icon={Tags} tone="amber">
        New rate list
      </PageHeading>
      <Suspense>
        <NewRateList />
      </Suspense>
    </div>
  );
}
