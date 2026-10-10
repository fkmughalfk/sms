'use client';

import {
  BUSINESS_TIMEZONE,
  canManageRole,
  type Role,
  ROLES,
  type User,
  userListSchema,
  userSchema,
} from '@sms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, KeyRound, Pencil, Plus, Power, Trash2, UserRound, Users } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { ResetPasswordDialog } from './reset-password-dialog';
import { UserDialog } from './user-dialog';
import { Badge } from '@/components/ui/badge';
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
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/roles';
import { useTableState } from '@/lib/use-table';
import { PageHeading } from '@/components/form-section';
import { FilterBar } from '@/components/data-table/filter-bar';
import { RowActions } from '@/components/data-table/row-actions';
import { BulkBar, SelectAllHead, SelectCell } from '@/components/data-table/bulk';
import { fetchAllIds, useSelection } from '@/lib/use-selection';
import { DeleteDialog } from '@/components/delete-dialog';
import { DetailsDialog } from '@/components/details-dialog';

const ALL = 'all';

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIMEZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

export default function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>(ALL);
  const [status, setStatus] = useState<string>('true');
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [viewing, setViewing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const filterQuery = new URLSearchParams();
  if (deferredSearch) filterQuery.set('search', deferredSearch);
  if (role !== ALL) filterQuery.set('role', role);
  if (status !== ALL) filterQuery.set('active', status);
  const table = useTableState({ sort: 'name:asc', resetOn: filterQuery.toString() });
  const params = table.apply(new URLSearchParams(filterQuery));

  const { data, isPending, error } = useQuery({
    queryKey: ['users', params.toString()],
    queryFn: () => api.get(`/users?${params}`, userListSchema),
    placeholderData: keepPreviousData,
  });

  const toggleStatus = useMutation({
    mutationFn: (u: User) =>
      api.patch(`/users/${u.id}/status`, userSchema, { isActive: !u.isActive }),
    onSuccess: (u) => {
      toast.success(`${u.name} ${u.isActive ? 'activated' : 'deactivated'}.`);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong.'),
  });

  const assignableRoles = ROLES.filter((r) => canManageRole(me.role, r));
  const selection = useSelection(data?.data.map((u) => u.id) ?? [], filterQuery.toString());

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageHeading icon={Users} tone="fuchsia">
            Users
          </PageHeading>
          <p className="text-sm text-muted-foreground">
            {me.role === 'SUPER_ADMIN'
              ? 'Manage admins and users.'
              : 'Manage users with the User role.'}
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus /> New user
        </Button>
      </div>

      <FilterBar tone="fuchsia" className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64"
        />
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All roles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
            <SelectItem value={ALL}>All</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <BulkBar
        selection={selection}
        total={data?.meta.total ?? 0}
        noun="users"
        actions={['activate', 'deactivate', 'delete']}
        endpoint="/users/bulk"
        invalidate={[['users']]}
        onSelectAll={() => fetchAllIds('/users', filterQuery)}
        describe={{
          deactivate: 'They are signed out and can no longer log in. Your own account is skipped.',
          delete:
            'Only accounts that never logged in or entered anything are deleted; the rest are skipped — deactivate those instead.',
        }}
      />

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <SelectAllHead selection={selection} />
              <SortableHead field="name" sort={table.sort} onSort={table.toggleSort}>
                Name
              </SortableHead>
              <SortableHead field="email" sort={table.sort} onSort={table.toggleSort}>
                Email
              </SortableHead>
              <SortableHead field="role" sort={table.sort} onSort={table.toggleSort}>
                Role
              </SortableHead>
              <SortableHead
                field="isActive"
                sort={table.sort}
                onSort={table.toggleSort}
                firstDir="desc"
              >
                Status
              </SortableHead>
              <SortableHead
                field="lastLoginAt"
                sort={table.sort}
                onSort={table.toggleSort}
                firstDir="desc"
                className="hidden lg:table-cell"
              >
                Last login
              </SortableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
            {data?.data.map((u) => {
              const manageable = canManageRole(me.role, u.role);
              return (
                <TableRow
                  key={u.id}
                  data-state={selection.has(u.id) ? 'selected' : undefined}
                  className={u.isActive ? undefined : 'text-muted-foreground'}
                >
                  <SelectCell selection={selection} id={u.id} label={u.name} />
                  <TableCell className="font-medium">
                    {u.name}
                    {u.id === me.id && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        u.role === 'SUPER_ADMIN'
                          ? 'violet'
                          : u.role === 'ADMIN'
                            ? 'info'
                            : 'secondary'
                      }
                    >
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? 'success' : 'danger'}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {u.lastLoginAt ? dateTime.format(new Date(u.lastLoginAt)) : '—'}
                  </TableCell>
                  <TableCell>
                    <RowActions
                      label={u.name}
                      actions={[
                        { label: 'View', icon: Eye, onSelect: () => setViewing(u) },
                        {
                          label: 'Edit',
                          icon: Pencil,
                          onSelect: () => setEditing(u),
                          show: manageable,
                        },
                        {
                          label: 'Reset password',
                          icon: KeyRound,
                          onSelect: () => setResetting(u),
                          show: manageable,
                        },
                        {
                          label: u.isActive ? 'Deactivate' : 'Activate',
                          icon: Power,
                          onSelect: () => toggleStatus.mutate(u),
                          destructive: u.isActive,
                          show: manageable && u.id !== me.id,
                        },
                        {
                          label: 'Delete',
                          icon: Trash2,
                          onSelect: () => setDeleting(u),
                          destructive: true,
                          show: manageable && u.id !== me.id,
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
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
          noun="users"
        />
      )}

      <UserDialog
        user={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        assignableRoles={assignableRoles as Role[]}
      />
      <ResetPasswordDialog user={resetting} onOpenChange={(open) => !open && setResetting(null)} />
      <DetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.name}
        description={viewing?.email}
        icon={UserRound}
        tone="fuchsia"
        items={
          viewing
            ? [
                { label: 'Name', value: viewing.name },
                { label: 'Email', value: viewing.email },
                {
                  label: 'Role',
                  value: (
                    <Badge
                      variant={
                        viewing.role === 'SUPER_ADMIN'
                          ? 'violet'
                          : viewing.role === 'ADMIN'
                            ? 'info'
                            : 'secondary'
                      }
                    >
                      {ROLE_LABELS[viewing.role]}
                    </Badge>
                  ),
                },
                {
                  label: 'Status',
                  value: (
                    <Badge variant={viewing.isActive ? 'success' : 'danger'}>
                      {viewing.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  ),
                },
                { label: 'Linked salesperson', value: viewing.salesperson?.name },
                {
                  label: 'Last login',
                  value: viewing.lastLoginAt && dateTime.format(new Date(viewing.lastLoginAt)),
                },
                { label: 'Created', value: dateTime.format(new Date(viewing.createdAt)) },
              ]
            : []
        }
        actions={
          viewing &&
          canManageRole(me.role, viewing.role) && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(viewing);
                setViewing(null);
              }}
            >
              <Pencil /> Edit
            </Button>
          )
        }
      />
      <DeleteDialog
        path={deleting && `/users/${deleting.id}`}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This removes the account for good. Accounts that have logged in or entered any records can't be deleted — deactivate them instead."
        successMessage={`${deleting?.name} deleted.`}
        invalidate={[['users']]}
      />
    </div>
  );
}
