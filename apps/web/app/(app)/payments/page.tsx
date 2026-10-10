'use client';

import {
  BUSINESS_TIMEZONE,
  formatMonthHeading,
  formatPKR2,
  formatQty,
  partyOptionSchema,
  type PaymentRow,
  paymentListSchema,
} from '@sms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Combobox } from '@/components/combobox';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
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
import { PageHeading } from '@/components/form-section';
import { FilterBar } from '@/components/data-table/filter-bar';
import { RowActions } from '@/components/data-table/row-actions';
import { BulkBar, SelectAllHead, SelectCell } from '@/components/data-table/bulk';
import { fetchAllIds, useSelection } from '@/lib/use-selection';
import { DetailsDialog } from '@/components/details-dialog';

interface Filters {
  month: string;
  from: string;
  to: string;
  partyId: string | null;
  bankId: string | null;
  search: string;
}

const initialFilters = (): Filters => ({
  month: '', // all dates, newest first — pick a month to narrow it
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
  const [viewing, setViewing] = useState<PaymentRow | null>(null);
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

  const usingRange = !!(filters.from || filters.to);
  const heading = usingRange
    ? `${filters.from ? toDisplayDate(filters.from) : '…'} to ${filters.to ? toDisplayDate(filters.to) : '…'}`
    : filters.month
      ? formatMonthHeading(filters.month)
      : 'All dates';
  const total = data?.meta.total ?? 0;
  const canBulk = can('payment.delete');
  const selection = useSelection(data?.data.map((p) => p.id) ?? [], params.toString());

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageHeading icon={Wallet} tone="emerald">
            Payments
          </PageHeading>
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

      <FilterBar tone="emerald" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
      </FilterBar>

      {canBulk && (
        <BulkBar
          selection={selection}
          total={total}
          noun="payments"
          actions={['delete']}
          endpoint="/payments/bulk-delete"
          invalidate={[['payments'], ['recovery'], ['reports']]}
          onSelectAll={() => fetchAllIds('/payments', params)}
          describe={{
            delete:
              "They disappear from lists and totals, and each party's outstanding goes up by the amounts. Each delete is in the audit log.",
          }}
        />
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              {canBulk && <SelectAllHead selection={selection} />}
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
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isPending || error || data?.data.length === 0) && (
              <TableRow>
                <TableCell colSpan={canBulk ? 9 : 8} className="text-center text-muted-foreground">
                  {isPending
                    ? 'Loading…'
                    : error
                      ? error.message
                      : 'No payments for these filters.'}
                </TableCell>
              </TableRow>
            )}
            {data?.data.map((p) => (
              <TableRow key={p.id} data-state={selection.has(p.id) ? 'selected' : undefined}>
                {canBulk && (
                  <SelectCell
                    selection={selection}
                    id={p.id}
                    label={`payment of ${formatPKR2(p.amount)}`}
                  />
                )}
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
                <TableCell>
                  <RowActions
                    label={`payment of ${formatPKR2(p.amount)}`}
                    actions={[
                      { label: 'View', icon: Eye, onSelect: () => setViewing(p) },
                      {
                        label: 'Edit',
                        icon: Pencil,
                        onSelect: () => router.push(`/payments/${p.id}/edit`),
                        show: can('payment.edit'),
                      },
                      {
                        label: 'Delete',
                        icon: Trash2,
                        onSelect: () => setDeleting(p),
                        destructive: true,
                        show: can('payment.delete'),
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {data && data.data.length > 0 && (
            <TableFooter>
              <TableRow className="font-semibold">
                {canBulk && <TableCell />}
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
                <TableCell />
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

      <DetailsDialog
        open={viewing !== null}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing && formatPKR2(viewing.amount)}
        description={viewing && `Payment from ${viewing.party.name}`}
        icon={Wallet}
        tone="emerald"
        items={
          viewing
            ? [
                { label: 'Date', value: toDisplayDate(viewing.paymentDate) },
                { label: 'Amount (PKR)', value: formatPKR2(viewing.amount) },
                {
                  label: 'Party',
                  value: (
                    <Link
                      href={`/recovery/${viewing.party.id}`}
                      className="text-primary hover:underline"
                    >
                      {viewing.party.name}
                    </Link>
                  ),
                },
                { label: 'Sub party', value: viewing.subParty?.name },
                { label: 'Bank', value: viewing.bank?.name },
                { label: 'Slip / Transaction No.', value: viewing.slipNo },
                { label: 'Remarks', value: viewing.remarks, wide: true },
                { label: 'Entered by', value: viewing.createdBy.name },
                {
                  label: 'Entered on',
                  value: new Date(viewing.createdAt).toLocaleString('en-GB', {
                    timeZone: BUSINESS_TIMEZONE,
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                },
              ]
            : []
        }
        actions={
          viewing &&
          can('payment.edit') && (
            <Button variant="secondary" onClick={() => router.push(`/payments/${viewing.id}/edit`)}>
              <Pencil /> Edit
            </Button>
          )
        }
      />

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
