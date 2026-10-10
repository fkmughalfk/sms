'use client';

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  type AuditEntry,
  auditDiff,
  auditListSchema,
  BUSINESS_TIMEZONE,
  userListSchema,
} from '@sms/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, X, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactNode, useState } from 'react';
import { Combobox } from '@/components/combobox';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { api } from '@/lib/api';
import { useTableState } from '@/lib/use-table';
import { PageHeading } from '@/components/form-section';

const ALL = 'all';

const when = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIMEZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const ACTION_VARIANT: Record<string, BadgeVariant> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  LOGIN: 'outline',
  IMPORT: 'violet',
};

/** Where an entry's record lives in the app, if it has a page. */
function recordLink(e: AuditEntry): string | null {
  if (!e.entityId) return null;
  switch (e.entity) {
    case 'Invoice':
      return `/invoices/${e.entityId}`;
    case 'Party':
      return `/recovery/${e.entityId}`;
    default:
      return null;
  }
}

const show = (v: unknown): string =>
  v === undefined
    ? '—'
    : v === null
      ? 'empty'
      : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v);

function Diff({ entry }: { entry: AuditEntry }) {
  if (entry.action === 'LOGIN') {
    return <p className="text-sm">Signed in{entry.ip ? ` from ${entry.ip}` : ''}.</p>;
  }
  const rows = auditDiff(entry.before, entry.after);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No field details recorded.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-muted-foreground">
        <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium">
          <th className="w-48">Field</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.field} className="border-t align-top [&>td]:px-2 [&>td]:py-1">
            <td className="font-medium">{r.field}</td>
            <td className="break-all text-muted-foreground">{show(r.before)}</td>
            <td className="break-all">{show(r.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
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

/** Spec §5.9 — who changed what, with a before/after diff. SUPER_ADMIN and ADMIN. */
export default function AuditPage() {
  const [entity, setEntity] = useState<string>(ALL);
  const [action, setAction] = useState<string>(ALL);
  const [userId, setUserId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const users = useQuery({
    queryKey: ['users', 'all-for-audit'],
    queryFn: () => api.get('/users?pageSize=500', userListSchema),
    staleTime: 5 * 60_000,
  });

  const filterQuery = new URLSearchParams();
  if (entity !== ALL) filterQuery.set('entity', entity);
  if (action !== ALL) filterQuery.set('action', action);
  if (userId) filterQuery.set('userId', userId);
  if (from) filterQuery.set('from', from);
  if (to) filterQuery.set('to', to);
  const table = useTableState({ sort: 'createdAt:desc', resetOn: filterQuery.toString() });
  const params = table.apply(new URLSearchParams(filterQuery));

  const { data, isPending, error } = useQuery({
    queryKey: ['audit', params.toString()],
    queryFn: () => api.get(`/audit?${params}`, auditListSchema),
    placeholderData: keepPreviousData,
  });

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div>
        <PageHeading icon={ScrollText} tone="amber">
          Audit log
        </PageHeading>
        <p className="text-sm text-muted-foreground">
          Every change to invoices, payments, masters, users and settings, plus logins and imports.
        </p>
      </div>

      <div className="grid gap-2 rounded-xl border border-l-4 border-l-amber-500 bg-card p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <Field label="What">
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everything</SelectItem>
              {AUDIT_ENTITIES.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Action">
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actions</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a.charAt(0) + a.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="User">
          <Combobox
            options={(users.data?.data ?? []).map((u) => ({
              value: u.id,
              label: u.name,
              hint: u.email,
            }))}
            value={userId}
            onChange={setUserId}
            placeholder="All users"
            noneLabel="All users"
          />
        </Field>
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEntity(ALL);
              setAction(ALL);
              setUserId(null);
              setFrom('');
              setTo('');
            }}
          >
            <X /> Reset filters
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <SortableHead
                field="createdAt"
                sort={table.sort}
                onSort={table.toggleSort}
                firstDir="desc"
                className="w-44"
              >
                When
              </SortableHead>
              <TableHead>User</TableHead>
              <SortableHead field="action" sort={table.sort} onSort={table.toggleSort}>
                Action
              </SortableHead>
              <SortableHead field="entity" sort={table.sort} onSort={table.toggleSort}>
                What
              </SortableHead>
              <TableHead className="hidden md:table-cell">Changed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isPending || error || data?.data.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {isPending
                    ? 'Loading…'
                    : error
                      ? error.message
                      : 'Nothing recorded for these filters.'}
                </TableCell>
              </TableRow>
            )}
            {data?.data.map((e) => {
              const isOpen = open.has(e.id);
              const changed = auditDiff(e.before, e.after).map((d) => d.field);
              const link = recordLink(e);
              return (
                <Fragment key={e.id}>
                  <TableRow className="cursor-pointer" onClick={() => toggle(e.id)}>
                    <TableCell>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? 'Hide details' : 'Show details'}
                        className="text-muted-foreground"
                      >
                        {isOpen ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {when.format(new Date(e.createdAt))}
                    </TableCell>
                    <TableCell>
                      {e.user?.name ?? <span className="text-muted-foreground">System</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ACTION_VARIANT[e.action] ?? 'outline'}>
                        {e.action.charAt(0) + e.action.slice(1).toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {e.entity}
                      {link && (
                        <Link
                          href={link}
                          className="ml-2 text-xs text-muted-foreground underline"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          open
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-80 truncate text-muted-foreground md:table-cell">
                      {e.action === 'LOGIN' ? (e.ip ?? '') : changed.join(', ')}
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={5} className="whitespace-normal">
                        <Diff entry={e} />
                        {e.ip && e.action !== 'LOGIN' && (
                          <p className="mt-2 text-xs text-muted-foreground">IP {e.ip}</p>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
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
          noun="entries"
        />
      )}
    </div>
  );
}
