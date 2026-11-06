'use client';

import {
  formatPKR,
  type PdfImportRow,
  pdfImportRowSchema,
  type PdfImportStatus,
} from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, FileUp, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeading } from '@/components/form-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PDF_STATUS, PDFS_KEY, usePdfImports } from '@/lib/invoice-pdfs';
import { ORDERS_KEY, formatOrderDate } from '@/lib/orders';
import { cn } from '@/lib/utils';

const TABS: (PdfImportStatus | '')[] = ['NEEDS_REVIEW', 'POSTED', 'DUPLICATE', 'FAILED', ''];
const MAX_PER_UPLOAD = 25;

function Row({ r }: { r: PdfImportRow }) {
  return (
    <li>
      <Link
        href={`/invoices/pdfs/${r.id}`}
        className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40"
      >
        <span className="w-14 shrink-0 font-semibold tabular-nums">{r.invoiceNo ?? '—'}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{r.party || r.fileName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {r.invoiceDate ? formatOrderDate(r.invoiceDate) : 'No date'} · {r.fileName}
            {r.problems[0] && (
              <span className="text-amber-700 dark:text-amber-400"> · {r.problems[0]}</span>
            )}
          </p>
        </div>
        <div className="text-right">
          {r.amount && <p className="font-semibold tabular-nums">{formatPKR(r.amount)}</p>}
          <Badge variant={PDF_STATUS[r.status].variant}>{PDF_STATUS[r.status].label}</Badge>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

/**
 * Invoice PDFs from the current software (orders module, phase O4). Drop them in: each is
 * read and checked; clear ones post at once and reduce pending orders, the rest wait here.
 */
export default function InvoicePdfsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PdfImportStatus | ''>('NEEDS_REVIEW');
  const [last, setLast] = useState<PdfImportRow[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = usePdfImports(status);

  const upload = useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData();
      for (const f of files) form.append('files', f);
      return api.upload('/invoice-pdfs', z.array(pdfImportRowSchema), form);
    },
    onSuccess: (rows) => {
      setLast(rows);
      const posted = rows.filter((r) => r.status === 'POSTED').length;
      const review = rows.filter((r) => r.status === 'NEEDS_REVIEW').length;
      toast.success(
        `${posted} posted${review ? `, ${review} need review` : ''}${rows.length - posted - review ? `, ${rows.length - posted - review} not posted` : ''}.`,
      );
      void queryClient.invalidateQueries({ queryKey: PDFS_KEY });
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Upload failed.'),
  });

  const send = (files: FileList | File[] | null) => {
    const pdfs = [...(files ?? [])].filter(
      (f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf',
    );
    if (!pdfs.length) return toast.error('Choose PDF files.');
    for (let i = 0; i < pdfs.length; i += MAX_PER_UPLOAD)
      upload.mutate(pdfs.slice(i, i + MAX_PER_UPLOAD));
  };

  if (!can('invoicePdf.import')) {
    return <p className="text-sm text-muted-foreground">Only the office reads invoice PDFs.</p>;
  }

  return (
    <div className="grid max-w-5xl gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
          <Link href="/invoices">
            <ArrowLeft /> Invoices
          </Link>
        </Button>
        <PageHeading icon={FileUp} tone="indigo">
          Invoice PDFs
        </PageHeading>
        <p className="text-sm text-muted-foreground">
          Invoices from your current software. Each PDF is read and checked; clear ones are recorded
          at once and reduce the pending orders. Anything unclear waits under Needs review.
        </p>
      </div>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          send(e.dataTransfer.files);
        }}
        disabled={upload.isPending}
        className={cn(
          'grid place-items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center text-sm transition-colors',
          dragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-muted/40',
        )}
      >
        <Upload className="size-6 text-muted-foreground" />
        <span className="font-medium">
          {upload.isPending ? 'Reading…' : 'Drop invoice PDFs here, or tap to choose'}
        </span>
        <span className="text-xs text-muted-foreground">Many at once is fine.</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          send(e.target.files);
          e.target.value = '';
        }}
      />

      {last && (
        <section className="overflow-hidden rounded-xl border bg-card">
          <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">Just uploaded</h2>
          <ul className="divide-y">
            {last.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((s) => (
          <Button
            key={s || 'all'}
            size="sm"
            variant={status === s ? 'default' : 'outline'}
            onClick={() => setStatus(s)}
          >
            {s ? PDF_STATUS[s].label : 'All'}
            {s && list.data?.counts[s] ? ` (${list.data.counts[s]})` : ''}
          </Button>
        ))}
      </div>
      {list.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list.data && list.data.data.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing here.
        </p>
      )}
      {list.data && list.data.data.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {list.data.data.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
