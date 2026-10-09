'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
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
        <h1 className="text-xl font-semibold">Record payment</h1>
      </div>
      <PaymentForm />
    </div>
  );
}
