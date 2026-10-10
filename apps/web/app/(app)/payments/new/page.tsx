'use client';

import { ArrowLeft, HandCoins } from 'lucide-react';
import Link from 'next/link';
import { PageTitle } from '@/components/form-section';
import { PaymentForm } from '@/components/payment/payment-form';

export default function NewPaymentPage() {
  return (
    <div className="grid gap-4">
      <div>
        <Link
          href="/payments"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3" /> Payments
        </Link>
        <PageTitle icon={HandCoins} tone="emerald" title="Record payment" />
      </div>
      <PaymentForm />
    </div>
  );
}
