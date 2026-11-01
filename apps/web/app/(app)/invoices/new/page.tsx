'use client';

import { invoiceDetailSchema } from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FilePlus2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageTitle } from '@/components/form-section';
import { InvoiceForm } from '@/components/invoice/invoice-form';
import { api } from '@/lib/api';

export default function NewInvoicePage() {
  return (
    <div className="grid gap-4">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <NewInvoice />
      </Suspense>
    </div>
  );
}

/** `?copy=<id>` starts from an existing invoice (Phase 1 quick wins). */
function NewInvoice() {
  const copyId = useSearchParams().get('copy');
  const source = useQuery({
    queryKey: ['invoices', 'detail', copyId],
    queryFn: () => api.get(`/invoices/${copyId}`, invoiceDetailSchema),
    enabled: !!copyId,
  });

  return (
    <>
      <div>
        <Link
          href="/invoices"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3" /> Invoices
        </Link>
        <PageTitle
          icon={FilePlus2}
          tone="indigo"
          title={source.data ? `New invoice — copy of #${source.data.invoiceNo}` : 'New invoice'}
        />
      </div>
      {!copyId ? (
        <InvoiceForm />
      ) : source.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : source.error ? (
        <p className="text-sm text-destructive">{source.error.message}</p>
      ) : (
        <InvoiceForm key={copyId} copyFrom={source.data} />
      )}
    </>
  );
}
