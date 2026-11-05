'use client';

import { formatPKR, ORDER_STATUSES, type OrderStatus } from '@sms/shared';
import { ChevronRight, ClipboardList, ListChecks, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeading } from '@/components/form-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { formatOrderDate, ORDER_STATUS, useOrders } from '@/lib/orders';
import { cn } from '@/lib/utils';

/** Orders, newest first; filter by status (orders module, phase O2). */
export default function OrdersPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [orderNo, setOrderNo] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: '50',
    ...(status ? { status } : {}),
    ...(/^\d+$/.test(orderNo) ? { orderNo } : {}),
  }).toString();
  const orders = useOrders(query);
  const total = orders.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <PageHeading icon={ClipboardList} tone="sky">
            Orders
          </PageHeading>
          <p className="text-sm text-muted-foreground">Booked at the rate list in force.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/orders/pending">
            <ListChecks /> Pending report
          </Link>
        </Button>
        {can('order.create') && (
          <Button asChild>
            <Link href="/orders/new">
              <Plus /> New order
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['', ...ORDER_STATUSES] as const).map((s) => (
          <Button
            key={s || 'all'}
            size="sm"
            variant={status === s ? 'default' : 'outline'}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
          >
            {s ? ORDER_STATUS[s].label : 'All'}
          </Button>
        ))}
        <Input
          aria-label="Order no."
          placeholder="Order no."
          inputMode="numeric"
          className="ml-auto w-32"
          value={orderNo}
          onChange={(e) => {
            setOrderNo(e.target.value.replace(/\D/g, ''));
            setPage(1);
          }}
        />
      </div>

      {orders.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {orders.error && <p className="text-sm text-destructive">{orders.error.message}</p>}
      {orders.data && orders.data.data.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No orders{status ? ` with status "${ORDER_STATUS[status].label}"` : ''}.
        </p>
      )}
      {orders.data && orders.data.data.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {orders.data.data.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${o.id}`}
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40"
              >
                <span className="w-14 shrink-0 font-semibold tabular-nums">{o.orderNo}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {o.party.name}
                    {o.subParty && (
                      <span className="text-muted-foreground"> · {o.subParty.name}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatOrderDate(o.orderDate)}
                    {o.city && ` · ${o.city.name}`}
                    {o.salesperson && ` · ${o.salesperson.name}`} · {o.totalPacks} packs
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatPKR(o.totalAmount)}</p>
                  <Badge variant={ORDER_STATUS[o.status].variant}>
                    {ORDER_STATUS[o.status].label}
                  </Badge>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className={cn('flex items-center justify-end gap-2 text-sm')}>
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
