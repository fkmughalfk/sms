'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateUserInput,
  createUserSchema,
  type Role,
  type UpdateUserInput,
  updateUserSchema,
  type User,
  userSchema,
} from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/roles';

type FormValues = z.input<typeof createUserSchema>;

/** Create (user = null) or edit a user. Password is only asked for on create. */
export function UserDialog({
  user,
  open,
  onOpenChange,
  assignableRoles,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignableRoles: Role[];
}) {
  const isEdit = user !== null;
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    // On edit the password field is hidden, so validate with the update schema.
    resolver: zodResolver(
      (isEdit ? updateUserSchema : createUserSchema) as typeof createUserSchema,
    ),
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) {
      form.reset(
        user
          ? { name: user.name, email: user.email, role: user.role }
          : { name: '', email: '', password: '', role: 'USER' },
      );
    }
  }, [open, user, form]);

  const save = useMutation({
    mutationFn: (values: CreateUserInput | UpdateUserInput) =>
      isEdit
        ? api.patch(`/users/${user.id}`, userSchema, values)
        : api.post('/users', userSchema, values),
    onSuccess: (saved) => {
      toast.success(isEdit ? `${saved.name} updated.` : `${saved.name} created.`);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onOpenChange(false);
    },
    onError: (e) => {
      const message = e instanceof ApiError ? e.message : 'Something went wrong.';
      if (e instanceof ApiError && e.statusCode === 409) form.setError('email', { message });
      else toast.error(message);
    },
  });

  const onSubmit = form.handleSubmit((values) =>
    save.mutateAsync(values as CreateUserInput).catch(() => undefined),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit user' : 'New user'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Use “Reset password” to change their password.'
              : 'They can change this password after signing in.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField id="name" label="Name" error={errors.name?.message}>
            <Input id="name" autoComplete="off" {...form.register('name')} />
          </FormField>
          <FormField id="email" label="Email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="off" {...form.register('email')} />
          </FormField>
          {!isEdit && (
            <FormField id="password" label="Password" error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...form.register('password')}
              />
            </FormField>
          )}
          <FormField id="role" label="Role" error={errors.role?.message}>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={assignableRoles.length <= 1}
                >
                  <SelectTrigger id="role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
