'use client';

import {
  formatCommission,
  formatKg,
  formatMonthHeading,
  formatNumber,
  formatPKR,
  formatPKR2,
  formatQty,
  formatTons,
  invoiceLineListSchema,
  invoiceListSchema,
  type InvoiceTotals,
  partyOptionSchema,
  productOptionSchema,
} from '@sms/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Eye, FileText, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Combobox } from '@/components/combobox';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SortableHead } from '@/components/data-table/sortable-head';
import { TablePagination } from '@/components/data-table/table-pagination';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';
import { useTableState } from '@/lib/use-table';
import { PageHeading } from '@/components/form-section';
import { cn } from '@/lib/utils';
import { FilterBar } from '@/components/data-table/filter-bar';
import { RowActions } from '@/components/data-table/row-actions';
import { BulkBar, SelectAllHead, SelectCell } from '@/components/data-table/bulk';
import { fetchAllIds, useSelection } from '@/lib/use-selection';
import { DeleteDialog } from '@/components/delete-dialog';

interface Filters {
  month: string;
  from: string;
  to: string;
  partyId: string | null;
  cityId: string | null;
  salespersonId: string | null;
  productId: string | null;
  categoryId: string | null;
  invoiceNo: string;
}

const initialFilters = (): Filters => ({
  month: '', // all dates, newest first — pick a month to narrow it
  from: '',
  to: '',
  partyId: null,
  cityId: null,
  salespersonId: null,
  productId: null,
  categoryId: null,
  invoiceNo: '',
});

function toParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.from || f.to) {
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
  } else if (f.month) {
    p.set('month', f.month);
  }
  for (const k of ['partyId', 'cityId', 'salespersonId', 'productId', 'categoryId'] as const) {
    if (f[k]) p.set(k, f[k]);
  }
  if (/^\d+$/.test(f.invoiceNo.trim())) p.set('invoiceNo', f.invoiceNo.trim());
  return p;
}

const toDisplayDate = (d: string) => d.split('-').reverse().join('-');

/** Spec §5.3 — replaces the Excel "Database" sheet. */
export default function InvoicesPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [view, setView] = useState<'invoices' | 'lines'>('invoices');
  const [filters, setFilters] = useState(initialFilters);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState<{
    id: string;
    invoiceNo: number;
    lineCount: number;
  } | null>(null);
  const deferred = useDeferredValue(filters);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const parties = useMasterOptions('parties', z.array(partyOptionSchema));
  const cities = useMasterOptions('cities');
  const salespersons = useMasterOptions('salespersons');
  const products = useMasterOptions('products', z.array(productOptionSchema));
  const categories = useMasterOptions('categories');

  const params = toParams(deferred);
  // Each view keeps its own sort and page; filter changes send both back to page 1.
  const invoiceTable = useTableState({ sort: 'invoiceDate:desc', resetOn: params.toString() });
  const lineTable = useTableState({ sort: 'invoiceDate:desc', resetOn: params.toString() });
  const table = view === 'invoices' ? invoiceTable : lineTable;
  const invoiceParams = invoiceTable.apply(new URLSearchParams(params));
  const lineParams = lineTable.apply(new URLSearchParams(params));

  const canBulk = can('invoice.delete');
  const invoices = useQuery({
    queryKey: ['invoices', 'list', invoiceParams.toString()],
    queryFn: () => api.get(`/invoices?${invoiceParams}`, invoiceListSchema),
    placeholderData: keepPreviousData,
    enabled: view === 'invoices',
  });
  const lines = useQuery({
    queryKey: ['invoices', 'lines', lineParams.toString()],
    queryFn: () => api.get(`/invoices/lines?${lineParams}`, invoiceLineListSchema),
    placeholderData: keepPreviousData,
    enabled: view === 'lines',
  });
  const active = view === 'invoices' ? invoices : lines;
  const totals = active.data?.totals;
  const total = active.data?.meta.total ?? 0;

  const exportExcel = async () => {
    setExporting(true);
    try {
      await api.download(`/invoices/export?${params}`, 'invoices.xlsx');
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

  const selection = useSelection(
    invoices.data?.data.map((i) => i.id) ?? [],
    `${view}:${params.toString()}`,
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageHeading icon={FileText} tone="indigo">
            Invoices
          </PageHeading>
          <p className="text-sm text-muted-foreground">{heading}</p>
        </div>
        <div className="flex gap-2">
          {can('export.excel') && (
            <Button variant="outline" onClick={exportExcel} disabled={exporting}>
              <Download /> {exporting ? 'Exporting…' : 'Export'}
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

      {/* Filters */}
      <FilterBar tone="indigo" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
        <Field label="Invoice No.">
          <Input
            inputMode="numeric"
            value={filters.invoiceNo}
            onChange={(e) => set('invoiceNo', e.target.value)}
          />
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
        <Field label="City">
          <Combobox
            options={toComboboxOptions(cities.data)}
            value={filters.cityId}
            onChange={(v) => set('cityId', v)}
            placeholder="All cities"
            noneLabel="All cities"
          />
        </Field>
        <Field label="ASM / Salesperson">
          <Combobox
            options={toComboboxOptions(salespersons.data)}
            value={filters.salespersonId}
            onChange={(v) => set('salespersonId', v)}
            placeholder="All salespersons"
            noneLabel="All salespersons"
          />
        </Field>
        <Field label="Product">
          <Combobox
            options={(products.data ?? []).map((p) => ({
              value: p.id,
              label: p.name,
              hint: `#${p.sku}`,
            }))}
            value={filters.productId}
            onChange={(v) => set('productId', v)}
            placeholder="All products"
            noneLabel="All products"
          />
        </Field>
        <Field label="Category">
          <Combobox
            options={toComboboxOptions(categories.data)}
            value={filters.categoryId}
            onChange={(v) => set('categoryId', v)}
            placeholder="All categories"
            noneLabel="All categories"
          />
        </Field>
        <div className="flex items-end">
          <Button variant="ghost" size="sm" onClick={() => setFilters(initialFilters())}>
            <X /> Reset filters
          </Button>
        </div>
      </FilterBar>

      <Tabs value={view} onValueChange={(v) => setView(v as 'invoices' | 'lines')}>
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="lines">Lines</TabsTrigger>
        </TabsList>
      </Tabs>

      {canBulk && view === 'invoices' && (
        <BulkBar
          selection={selection}
          total={invoices.data?.meta.total ?? 0}
          noun="invoices"
          actions={['delete']}
          endpoint="/invoices/bulk-delete"
          invalidate={[['invoices'], ['reports'], ['recovery']]}
          onSelectAll={() => fetchAllIds('/invoices', params)}
          describe={{
            delete:
              'They disappear from lists and totals with all their lines; their numbers stay reserved. Each delete is in the audit log.',
          }}
        />
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        {view === 'invoices' ? (
          <Table>
            <TableHeader>
              <TableRow>
                {canBulk && <SelectAllHead selection={selection} />}
                <SortableHead
                  field="invoiceNo"
                  sort={invoiceTable.sort}
                  onSort={invoiceTable.toggleSort}
                  firstDir="desc"
                  className="w-20"
                >
                  #
                </SortableHead>
                <SortableHead
                  field="invoiceDate"
                  sort={invoiceTable.sort}
                  onSort={invoiceTable.toggleSort}
                  firstDir="desc"
                  className="w-28"
                >
                  Date
                </SortableHead>
                <SortableHead
                  field="party"
                  sort={invoiceTable.sort}
                  onSort={invoiceTable.toggleSort}
                >
                  Party
                </SortableHead>
                <SortableHead
                  field="city"
                  sort={invoiceTable.sort}
                  onSort={invoiceTable.toggleSort}
                  className="hidden md:table-cell"
                >
                  City
                </SortableHead>
                <SortableHead
                  field="salesperson"
                  sort={invoiceTable.sort}
                  onSort={invoiceTable.toggleSort}
                  className="hidden lg:table-cell"
                >
                  ASM
                </SortableHead>
                <SortableHead
                  field="totalPacks"
                  sort={invoiceTable.sort}
                  onSort={invoiceTable.toggleSort}
                  firstDir="desc"
                  align="right"
                >
                  Bags
                </SortableHead>
                <SortableHead
                  field="totalWeightKg"
                  sort={invoiceTable.sort}
                  onSort={invoiceTable.toggleSort}
                  firstDir="desc"
                  align="right"
                  className="hidden sm:table-cell"
                >
                  Weight (KG)
                </SortableHead>
                <SortableHead
                  field="totalAmount"
                  sort={invoiceTable.sort}
                  onSort={invoiceTable.toggleSort}
                  firstDir="desc"
                  align="right"
                >
                  Amount
                </SortableHead>
                <SortableHead
                  field="totalCommission"
                  sort={invoiceTable.sort}
                  onSort={invoiceTable.toggleSort}
                  firstDir="desc"
                  align="right"
                  className="hidden md:table-cell"
                >
                  Commission
                </SortableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <StatusRows query={invoices} colSpan={canBulk ? 11 : 10} />
              {invoices.data?.data.map((inv) => (
                <TableRow
                  key={inv.id}
                  data-state={selection.has(inv.id) ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={() => router.push(`/invoices/${inv.id}`)}
                >
                  {canBulk && (
                    <SelectCell
                      selection={selection}
                      id={inv.id}
                      label={`invoice ${inv.invoiceNo}`}
                    />
                  )}
                  <TableCell className="font-medium tabular-nums">
                    <Link href={`/invoices/${inv.id}`} onClick={(e) => e.stopPropagation()}>
                      {inv.invoiceNo}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{toDisplayDate(inv.invoiceDate)}</TableCell>
                  <TableCell>{inv.party.name}</TableCell>
                  <TableCell className="hidden md:table-cell">{inv.city?.name ?? '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {inv.salesperson?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQty(inv.totalPacks)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatKg(inv.totalWeightKg)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPKR(inv.totalAmount)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {formatCommission(inv.totalCommission)}
                  </TableCell>
                  <TableCell>
                    <RowActions
                      label={`invoice ${inv.invoiceNo}`}
                      actions={[
                        {
                          label: 'View',
                          icon: Eye,
                          onSelect: () => router.push(`/invoices/${inv.id}`),
                        },
                        {
                          label: 'Edit',
                          icon: Pencil,
                          onSelect: () => router.push(`/invoices/${inv.id}/edit`),
                          show: can('invoice.editAny') || can('invoice.editOwn'),
                        },
                        {
                          label: 'Print',
                          icon: Printer,
                          onSelect: () => router.push(`/invoices/${inv.id}/print`),
                        },
                        {
                          label: 'Delete',
                          icon: Trash2,
                          onSelect: () => setDeleting(inv),
                          destructive: true,
                          show: can('invoice.delete'),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Table className="min-w-[64rem]">
            <TableHeader>
              <TableRow>
                <SortableHead
                  field="invoiceNo"
                  sort={lineTable.sort}
                  onSort={lineTable.toggleSort}
                  firstDir="desc"
                >
                  #
                </SortableHead>
                <SortableHead
                  field="invoiceDate"
                  sort={lineTable.sort}
                  onSort={lineTable.toggleSort}
                  firstDir="desc"
                >
                  Date
                </SortableHead>
                <SortableHead field="party" sort={lineTable.sort} onSort={lineTable.toggleSort}>
                  Party
                </SortableHead>
                <SortableHead field="product" sort={lineTable.sort} onSort={lineTable.toggleSort}>
                  Description
                </SortableHead>
                <SortableHead field="category" sort={lineTable.sort} onSort={lineTable.toggleSort}>
                  Category
                </SortableHead>
                <SortableHead
                  field="qtyPacks"
                  sort={lineTable.sort}
                  onSort={lineTable.toggleSort}
                  firstDir="desc"
                  align="right"
                >
                  Bags
                </SortableHead>
                <SortableHead
                  field="packWeightKg"
                  sort={lineTable.sort}
                  onSort={lineTable.toggleSort}
                  firstDir="desc"
                  align="right"
                >
                  Pack Wt
                </SortableHead>
                <SortableHead
                  field="rate40Kg"
                  sort={lineTable.sort}
                  onSort={lineTable.toggleSort}
                  firstDir="desc"
                  align="right"
                >
                  Rate 40Kg
                </SortableHead>
                <SortableHead
                  field="ratePerPack"
                  sort={lineTable.sort}
                  onSort={lineTable.toggleSort}
                  firstDir="desc"
                  align="right"
                >
                  Rate/Pack
                </SortableHead>
                <SortableHead
                  field="amount"
                  sort={lineTable.sort}
                  onSort={lineTable.toggleSort}
                  firstDir="desc"
                  align="right"
                >
                  Amount
                </SortableHead>
                <SortableHead
                  field="commission"
                  sort={lineTable.sort}
                  onSort={lineTable.toggleSort}
                  firstDir="desc"
                  align="right"
                >
                  Commission
                </SortableHead>
                <SortableHead
                  field="weightKg"
                  sort={lineTable.sort}
                  onSort={lineTable.toggleSort}
                  firstDir="desc"
                  align="right"
                >
                  Weight
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <StatusRows query={lines} colSpan={12} />
              {lines.data?.data.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="tabular-nums">
                    <Link href={`/invoices/${l.invoiceId}`} className="hover:underline">
                      {l.invoiceNo}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{toDisplayDate(l.invoiceDate)}</TableCell>
                  <TableCell>{l.party.name}</TableCell>
                  <TableCell>{l.product.name}</TableCell>
                  <TableCell>{l.category.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(l.qtyPacks)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatKg(l.packWeightKg)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(l.rate40Kg, 2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(l.ratePerPack, 2)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPKR(l.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCommission(l.commission)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatKg(l.weightKg)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {totals && (
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell colSpan={5}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQty(totals.totalPacks)}
                  </TableCell>
                  <TableCell colSpan={3} />
                  <TableCell className="text-right tabular-nums">
                    {formatPKR(totals.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCommission(totals.totalCommission)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatKg(totals.totalWeightKg)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </div>

      {active.data && (
        <TablePagination
          page={table.page}
          pageSize={table.pageSize}
          total={total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          noun={view === 'invoices' ? 'invoices' : 'lines'}
        />
      )}

      {totals && <TotalsPanel totals={totals} />}

      <DeleteDialog
        path={deleting && `/invoices/${deleting.id}`}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete invoice ${deleting?.invoiceNo}?`}
        description={`Delete all ${deleting?.lineCount} line(s) of invoice ${deleting?.invoiceNo}? It will disappear from lists and totals; the number stays reserved.`}
        successMessage={`Invoice ${deleting?.invoiceNo} deleted.`}
        invalidate={[['invoices'], ['reports'], ['recovery']]}
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

function StatusRows({
  query,
  colSpan,
}: {
  query: { isPending: boolean; error: Error | null; data?: { data: unknown[] } };
  colSpan: number;
}) {
  const message = query.isPending
    ? 'Loading…'
    : query.error
      ? query.error.message
      : query.data?.data.length === 0
        ? 'No invoices for these filters.'
        : null;
  if (!message) return null;
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}

/** Soft tinted backgrounds for the totals tiles (label takes the tint, value stays in ink). */
const TILE_TINTS = [
  'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300',
  'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300',
  'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-300',
  'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300',
  'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
];

/** Database Q5:R10 — Weight (Tons), Total Sale, Commission, Total Packs, Avg per Ton, Avg per Pack. */
function TotalsPanel({ totals }: { totals: InvoiceTotals }) {
  const items: [string, string][] = [
    ['Invoices', formatQty(totals.invoices)],
    ['Weight (Tons)', formatTons(totals.totalWeightKg)],
    ['Total Sale', formatPKR(totals.totalAmount)],
    ['Commission', formatCommission(totals.totalCommission)],
    ['Total Packs', formatQty(totals.totalPacks)],
    ['Avg per Ton', formatPKR2(totals.avgPerTon)],
    ['Avg per Pack', formatPKR2(totals.avgPerPack)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {items.map(([label, value], i) => (
        <div
          key={label}
          className={cn('rounded-xl border p-3 shadow-sm', TILE_TINTS[i % TILE_TINTS.length])}
        >
          <dt className="text-xs font-medium opacity-80">{label}</dt>
          <dd className="text-sm font-bold text-foreground tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
