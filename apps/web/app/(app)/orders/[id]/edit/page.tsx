'use client';

import { ClipboardList } from 'lucide-react';
import { useParams } from 'next/navigation';
import { PageHeading } from '@/components/form-section';
import { OrderForm } from '@/components/order/order-form';
import { useOrder } from '@/lib/orders';

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id);
  if (order.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (order.error) return <p className="text-sm text-destructive">{order.error.message}</p>;
  return (
    <div className="grid gap-5">
      <PageHeading icon={ClipboardList} tone="sky">
        Edit order {order.data.orderNo}
      </PageHeading>
      <OrderForm existing={order.data} />
    </div>
  );
}
