'use client';

import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { InvoiceDocument } from '@/components/invoice/invoice-document';
import { Button } from '@/components/ui/button';
import { useInvoice, useSettings } from '@/lib/use-invoice';

/** Print view (browser print CSS — spec §1.1). The app chrome is hidden with `.no-print`. */
export default function PrintInvoicePage() {
  const { data: invoice, error, isPending } = useInvoice();
  const settings = useSettings();
  const [showCommission, setShowCommission] = useState(false);

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/invoices/${invoice.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3" /> Invoice #{invoice.invoiceNo}
        </Link>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showCommission}
              onChange={(e) => setShowCommission(e.target.checked)}
            />
            Show commission
          </label>
          <Button onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </div>
      <InvoiceDocument invoice={invoice} settings={settings.data} showCommission={showCommission} />
    </div>
  );
}
