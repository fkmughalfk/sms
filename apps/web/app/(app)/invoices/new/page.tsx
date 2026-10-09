'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { InvoiceForm } from '@/components/invoice/invoice-form';

export default function NewInvoicePage() {
  return (
    <div className="grid gap-4">
      <div>
        <Link
          href="/invoices"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3" /> Invoices
        </Link>
        <h1 className="text-xl font-semibold">New invoice</h1>
      </div>
      <InvoiceForm />
    </div>
  );
}
