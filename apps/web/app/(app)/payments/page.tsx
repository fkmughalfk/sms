'use client';

import {
  businessMonth,
  formatMonthHeading,
  formatPKR2,
  formatQty,
  partyOptionSchema,
  type PaymentRow,
  paymentListSchema,
} from '@sms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Combobox } from '@/components/combobox';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/data-table/sortable-head';
import { TablePagination } from '@/components/data-table/table-pagination';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';
import { useTableState } from '@/lib/use-table';

interface Filters {
  month: string;
  from: string;
  to: string;
  partyId: string | null;
  bankId: string | null;
  search: string;
}

const initialFilters = (): Filters => ({
  month: businessMonth(),
  from: '',
  to: '',
  partyId: null,
  bankId: null,
  search: '',
});

function toParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.from || f.to) {
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
  } else if (f.month) {
    p.set('month', f.month);
  }
  if (f.partyId) p.set('partyId', f.partyId);
  if (f.bankId) p.set('bankId', f.bankId);
  if (f.search.trim()) p.set('search', f.search.trim());
  return p;
}

const toDisplayDate = (d: string) => d.split('-').reverse().join('-');

/** Spec §5.4 — payments list with filters and totals. */
export default function PaymentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [deleting, setDeleting] = useState<PaymentRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const deferred = useDeferredValue(filters);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const parties = useMasterOptions('parties', z.array(partyOptionSchema));
  const banks = useMasterOptions('banks');

  const params = toParams(deferred);
  const table = useTableState({ sort: 'paymentDate:desc', resetOn: params.toString() });
  const listParams = table.apply(new URLSearchParams(params));

  const { data, isPending, error } = useQuery({
    queryKey: ['payments', 'list', listParams.toString()],
    queryFn: () => api.get(`/payments?${listParams}`, paymentListSchema),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (p: PaymentRow) => api.delete(`/payments/${p.id}`, z.undefined()),
    onSuccess: () => {
      toast.success('Payment deleted.');
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['recovery'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong.'),
  });

  const exportExcel = async () => {
    setExporting(true);
    try {
      await api.download(`/payments/export?${params}`, 'payments.xlsx');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const canManage = can('payment.edit') || can('payment.delete');
  const usingRange = !!(filters.from || filters.to);
  const heading = usingRange
    ? `${filters.from ? toDisplayDate(filters.from) : '…'} to ${filters.to ? toDisplayDate(filters.to) : '…'}`
    : filters.month
      ? formatMonthHeading(filters.month)
      : 'All dates';
  const total = data?.meta.total ?? 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            {heading}
            {!can('reports.viewAll') && ' · payments you recorded'}
          </p>
        </div>
        <div className="flex gap-2">
          {can('export.excel') && (
            <Button variant="outline" onClick={exportExcel} disabled={exporting}>
              <Download /> {exporting ? 'Exporting…' : 'Export'}
            </Button>
          )}
          {can('payment.create') && (
            <Button asChild>
              <Link href="/payments/new">
                <Plus /> Record payment
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Month">
          <Input
            type="month"
            value={filters.month}
            disabled={usingRange}
            onChange={(e) => set('month', e.target.value)}
          />
        </Field>
        <Field label="From">
          <Input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </Field>
        <Field label="Slip no. / remarks">
          <Input value={filters.search} onChange={(e) => set('search', e.target.value)} />
        </Field>
        <Field label="Party">
          <Combobox
            options={toComboboxOptions(parties.data)}
            value={filters.partyId}
            onChange={(v) => set('partyId', v)}
            placeholder="All parties"
            noneLabel="All parties"
          />
        </Field>
        <Field label="Bank">
          <Combobox
            options={toComboboxOptions(banks.data)}
            value={filters.bankId}
            onChange={(v) => set('bankId', v)}
            placeholder="All banks"
            noneLabel="All banks"
          />
        </Field>
        <div className="flex items-end">
          <Button variant="ghost" size="sm" onClick={() => setFilters(initialFilters())}>
            <X /> Reset filters
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                field="paymentDate"
                sort={table.sort}
                onSort={table.toggleSort}
                firstDir="desc"
                className="w-28"
              >
                Date
              </SortableHead>
              <SortableHead field="party" sort={table.sort} onSort={table.toggleSort}>
                Party
              </SortableHead>
              <SortableHead
                field="subParty"
                sort={table.sort}
                onSort={table.toggleSort}
                className="hidden md:table-cell"
              >
                Sub Party
              </SortableHead>
              <SortableHead
                field="slipNo"
                sort={table.sort}
                onSort={table.toggleSort}
                className="hidden sm:table-cell"
              >
                Slip No.
              </SortableHead>
              <SortableHead field="bank" sort={table.sort} onSort={table.toggleSort}>
                Bank
              </SortableHead>
              <SortableHead
                field="amount"
                sort={table.sort}
                onSort={table.toggleSort}
                firstDir="desc"
                align="right"
              >
                Amount
              </SortableHead>
              <TableHead className="hidden lg:table-cell">Remarks</TableHead>
              {canManage && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isPending || error || data?.data.length === 0) && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {isPending
                    ? 'Loading…'
                    : error
                      ? error.message
                      : 'No payments for these filters.'}
                </TableCell>
              </TableRow>
            )}
            {data?.data.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="tabular-nums">{toDisplayDate(p.paymentDate)}</TableCell>
                <TableCell>
                  <Link href={`/recovery/${p.party.id}`} className="hover:underline">
                    {p.party.name}
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">{p.subParty?.name ?? '—'}</TableCell>
                <TableCell className="hidden sm:table-cell">{p.slipNo ?? '—'}</TableCell>
                <TableCell>{p.bank?.name ?? '—'}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatPKR2(p.amount)}
                </TableCell>
                <TableCell className="hidden max-w-64 truncate lg:table-cell">
                  {p.remarks ?? ''}
                </TableCell>
                {canManage && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Payment actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {can('payment.edit') && (
                          <DropdownMenuItem onSelect={() => router.push(`/payments/${p.id}/edit`)}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                        )}
                        {can('payment.delete') && (
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          {data && data.data.length > 0 && (
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell colSpan={2}>
                  Total · {formatQty(data.totals.payments)} payments
                </TableCell>
                <TableCell className="hidden md:table-cell" />
                <TableCell className="hidden sm:table-cell" />
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {formatPKR2(data.totals.totalAmount)}
                </TableCell>
                <TableCell className="hidden lg:table-cell" />
                {canManage && <TableCell />}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {data && (
        <TablePagination
          page={table.page}
          pageSize={table.pageSize}
          total={total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          noun="payments"
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this payment?"
        description={
          deleting &&
          `${formatPKR2(deleting.amount)} from ${deleting.party.name} on ${toDisplayDate(deleting.paymentDate)}. The party's outstanding goes up by this amount.`
        }
        confirmLabel="Delete payment"
        destructive
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
