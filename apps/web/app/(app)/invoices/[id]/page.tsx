'use client';

import { BUSINESS_TIMEZONE } from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { InvoiceDocument } from '@/components/invoice/invoice-document';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useInvoice, useSettings } from '@/lib/use-invoice';

const stamp = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIMEZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

export default function InvoicePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: invoice, error, isPending } = useInvoice();
  const settings = useSettings();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/invoices/${id}`, z.undefined()),
    onSuccess: () => {
      toast.success(`Invoice ${invoice?.invoiceNo} deleted.`);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      router.push('/invoices');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong.'),
  });

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  return (
    <div className="grid max-w-5xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/invoices"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-3" /> Invoices
          </Link>
          <h1 className="text-xl font-semibold">Invoice #{invoice.invoiceNo}</h1>
          <p className="text-xs text-muted-foreground">
            Entered by {invoice.createdBy.name} · {stamp.format(new Date(invoice.createdAt))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.canEdit && (
            <Button asChild variant="outline">
              <Link href={`/invoices/${invoice.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/invoices/${invoice.id}/print`}>
              <Printer /> Print
            </Link>
          </Button>
          {invoice.canDelete && (
            <Button variant="outline" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          )}
          {can('invoice.create') && (
            <Button asChild>
              <Link href="/invoices/new">
                <Plus /> New invoice
              </Link>
            </Button>
          )}
        </div>
      </div>

      <InvoiceDocument invoice={invoice} settings={settings.data} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete invoice ${invoice.invoiceNo}?`}
        description={`Delete all ${invoice.lineCount} line(s) of invoice ${invoice.invoiceNo}? It will disappear from lists and totals; the number stays reserved.`}
        confirmLabel="Delete invoice"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate(invoice.id)}
      />
    </div>
  );
}
