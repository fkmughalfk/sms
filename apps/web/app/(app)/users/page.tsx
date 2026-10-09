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
import { KeyRound, MoreHorizontal, Pencil, Plus, Power } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { ResetPasswordDialog } from './reset-password-dialog';
import { UserDialog } from './user-dialog';
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
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/roles';

const PAGE_SIZE = 25;
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
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    sort: 'name:asc',
  });
  if (deferredSearch) params.set('search', deferredSearch);
  if (role !== ALL) params.set('role', role);
  if (status !== ALL) params.set('active', status);

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
  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1;
  const resetPage =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
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

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => resetPage(setSearch)(e.target.value)}
          className="w-full sm:w-64"
        />
        <Select value={role} onValueChange={resetPage(setRole)}>
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
        <Select value={status} onValueChange={resetPage(setStatus)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
            <SelectItem value={ALL}>All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Last login</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
            {data?.data.map((u) => {
              const manageable = canManageRole(me.role, u.role);
              return (
                <TableRow key={u.id} className={u.isActive ? undefined : 'text-muted-foreground'}>
                  <TableCell className="font-medium">
                    {u.name}
                    {u.id === me.id && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'USER' ? 'secondary' : 'default'}>
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? 'outline' : 'destructive'}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {u.lastLoginAt ? dateTime.format(new Date(u.lastLoginAt)) : '—'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!manageable}
                          aria-label={`Actions for ${u.name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(u)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setResetting(u)}>
                          <KeyRound /> Reset password
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={u.id === me.id}
                          onSelect={() => toggleStatus.mutate(u)}
                          variant={u.isActive ? 'destructive' : 'default'}
                        >
                          <Power /> {u.isActive ? 'Deactivate' : 'Activate'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {data && data.meta.total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <UserDialog
        user={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        assignableRoles={assignableRoles as Role[]}
      />
      <ResetPasswordDialog user={resetting} onOpenChange={(open) => !open && setResetting(null)} />
    </div>
  );
}
