'use client';

import type { Paginated, Permission } from '@sms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Building2,
  Landmark,
  MapPin,
  Package,
  Tags,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/data-table/sortable-head';
import { TablePagination } from '@/components/data-table/table-pagination';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { masterKey } from '@/lib/masters';
import { useTableState } from '@/lib/use-table';
import { cn } from '@/lib/utils';
import { PageHeading } from '@/components/form-section';
import { FilterBar } from '@/components/data-table/filter-bar';

export interface Column<Row> {
  header: string;
  cell: (row: Row) => ReactNode;
  className?: string;
  /** API sort key (`?sort=key:dir`); omit for columns that can't be sorted. */
  sortKey?: string;
  /** Numbers sort high-to-low on the first click. */
  numeric?: boolean;
}

interface BaseRow {
  id: string;
  name: string;
  isActive: boolean;
}

const ALL = 'all';
const statusResponse = z.object({ id: z.string(), name: z.string(), isActive: z.boolean() });

/**
 * List screen shared by every master (spec §5.6): search, active filter, pagination,
 * edit and activate/deactivate. Rows are read-only without `managePermission`.
 */
const MASTER_ICONS: Record<string, LucideIcon> = {
  products: Package,
  categories: Tags,
  parties: Building2,
  'sub-parties': Users,
  cities: MapPin,
  salespersons: UserRound,
  banks: Landmark,
};

export function MasterListPage<Row extends BaseRow>({
  title,
  description,
  path,
  listSchema,
  columns,
  managePermission = 'masters.manage',
  searchPlaceholder = 'Search name…',
  filters,
  filterParams = {},
  renderDialog,
}: {
  title: string;
  description?: string;
  path: string;
  listSchema: z.ZodType<Paginated<Row>>;
  columns: Column<Row>[];
  managePermission?: Permission;
  searchPlaceholder?: string;
  /** Extra filter controls; their values go in `filterParams`. */
  filters?: ReactNode;
  filterParams?: Record<string, string | undefined>;
  renderDialog: (props: {
    row: Row | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => ReactNode;
}) {
  const { can } = useAuth();
  const canManage = can(managePermission);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('true');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const filterQuery = new URLSearchParams();
  if (deferredSearch) filterQuery.set('search', deferredSearch);
  if (status !== ALL) filterQuery.set('active', status);
  for (const [k, v] of Object.entries(filterParams)) if (v) filterQuery.set(k, v);
  const table = useTableState({ sort: 'name:asc', resetOn: filterQuery.toString() });
  const params = table.apply(new URLSearchParams(filterQuery));

  const { data, isPending, error } = useQuery({
    queryKey: [...masterKey(path), 'list', params.toString()],
    queryFn: () => api.get(`/${path}?${params}`, listSchema),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: (row: Row) =>
      api.patch(`/${path}/${row.id}/status`, statusResponse, { isActive: !row.isActive }),
    onSuccess: (row) => {
      toast.success(`${row.name} ${row.isActive ? 'activated' : 'deactivated'}.`);
      void queryClient.invalidateQueries({ queryKey: masterKey(path) });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong.'),
  });

  const colSpan = columns.length + 2;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/masters"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-3" /> Masters
          </Link>
          <PageHeading icon={MASTER_ICONS[path] ?? Building2} tone="amber">
            {title}
          </PageHeading>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus /> New
          </Button>
        )}
      </div>

      <FilterBar tone="amber" className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
            <SelectItem value={ALL}>All</SelectItem>
          </SelectContent>
        </Select>
        {filters}
      </FilterBar>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) =>
                c.sortKey ? (
                  <SortableHead
                    key={c.header}
                    field={c.sortKey}
                    sort={table.sort}
                    onSort={table.toggleSort}
                    firstDir={c.numeric ? 'desc' : 'asc'}
                    align={c.className?.includes('text-right') ? 'right' : 'left'}
                    className={c.className}
                  >
                    {c.header}
                  </SortableHead>
                ) : (
                  <TableHead key={c.header} className={c.className}>
                    {c.header}
                  </TableHead>
                ),
              )}
              <SortableHead
                field="isActive"
                sort={table.sort}
                onSort={table.toggleSort}
                firstDir="desc"
                className="w-24"
              >
                Status
              </SortableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                  Nothing found.
                </TableCell>
              </TableRow>
            )}
            {data?.data.map((row) => (
              <TableRow key={row.id} className={cn(!row.isActive && 'text-muted-foreground')}>
                {columns.map((c) => (
                  <TableCell key={c.header} className={c.className}>
                    {c.cell(row)}
                  </TableCell>
                ))}
                <TableCell>
                  <Badge variant={row.isActive ? 'success' : 'danger'}>
                    {row.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(row)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => toggle.mutate(row)}
                          variant={row.isActive ? 'destructive' : 'default'}
                        >
                          <Power /> {row.isActive ? 'Deactivate' : 'Activate'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data && (
        <TablePagination
          page={table.page}
          pageSize={table.pageSize}
          total={data.meta.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          noun="records"
        />
      )}

      {canManage &&
        renderDialog({
          row: editing === 'new' ? null : editing,
          open: editing !== null,
          onOpenChange: (open) => !open && setEditing(null),
        })}
    </div>
  );
}
