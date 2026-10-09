'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { InvoiceForm } from '@/components/invoice/invoice-form';
import { useInvoice } from '@/lib/use-invoice';

export default function EditInvoicePage() {
  const { data: invoice, error, isPending } = useInvoice();

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  return (
    <div className="grid gap-4">
      <div>
        <Link
          href={`/invoices/${invoice.id}`}
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3" /> Invoice #{invoice.invoiceNo}
        </Link>
        <h1 className="text-xl font-semibold">Edit invoice #{invoice.invoiceNo}</h1>
      </div>
      {invoice.canEdit ? (
        <InvoiceForm key={invoice.updatedAt} detail={invoice} />
      ) : (
        <p className="text-sm text-muted-foreground">
          You can no longer edit this invoice. Ask an admin if it needs a change.
        </p>
      )}
    </div>
  );
}
