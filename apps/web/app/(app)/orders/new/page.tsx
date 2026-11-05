'use client';

import { ClipboardList } from 'lucide-react';
import { PageHeading } from '@/components/form-section';
import { OrderForm } from '@/components/order/order-form';

export default function NewOrderPage() {
  return (
    <div className="grid gap-5">
      <PageHeading icon={ClipboardList} tone="sky">
        New order
      </PageHeading>
      <OrderForm />
    </div>
  );
}
