'use client';

import { paymentRowSchema } from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, HandCoins } from 'lucide-react';
import Link from 'next/link';
import { PageTitle } from '@/components/form-section';
import { useParams } from 'next/navigation';
import { PaymentForm } from '@/components/payment/payment-form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function EditPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { data, error, isPending } = useQuery({
    queryKey: ['payments', 'detail', id],
    queryFn: () => api.get(`/payments/${id}`, paymentRowSchema),
  });

  if (!can('payment.edit')) {
    return <p className="text-sm text-muted-foreground">Only admins can edit payments.</p>;
  }
  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  return (
    <div className="grid gap-4">
      <div>
        <Link
          href="/payments"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3" /> Payments
        </Link>
        <PageTitle icon={HandCoins} tone="emerald" title="Edit payment" />
        <p className="text-xs text-muted-foreground">Entered by {data.createdBy.name}</p>
      </div>
      <PaymentForm key={data.id} payment={data} />
    </div>
  );
}
