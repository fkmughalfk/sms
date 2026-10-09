'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import {
  type FieldValues,
  type Path,
  type Resolver,
  useForm,
  type UseFormReturn,
} from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import { masterKey } from '@/lib/masters';

type FormSchema = z.ZodType<FieldValues, FieldValues>;

/**
 * Create/edit dialog for one master record. Validates with the shared zod schema,
 * POSTs or PATCHes, maps server field errors back onto the form, and refreshes the
 * master's lists and dropdowns.
 */
export function EntityDialog<S extends FormSchema, Row extends { id: string; name: string }>({
  noun,
  path,
  schema,
  rowSchema,
  row,
  open,
  onOpenChange,
  defaults,
  description,
  onSaved,
  children,
}: {
  /** "city", "product"… */
  noun: string;
  /** API path, e.g. "cities". */
  path: string;
  schema: S;
  rowSchema: z.ZodType<Row>;
  /** null → create. */
  row: Row | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: (row: Row | null) => z.input<S>;
  description?: ReactNode;
  /** Called with the saved row (e.g. to select a party created inline). */
  onSaved?: (row: Row) => void;
  children: (form: UseFormReturn<z.input<S>, unknown, z.output<S>>) => ReactNode;
}) {
  const isEdit = row !== null;
  const queryClient = useQueryClient();
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema as never) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
  });

  useEffect(() => {
    if (open) form.reset(defaults(row));
    // `defaults` is recreated each render; re-run only when the dialog opens or the row changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row, form]);

  const save = useMutation({
    mutationFn: (body: z.output<S>) =>
      isEdit
        ? api.patch(`/${path}/${row.id}`, rowSchema, body)
        : api.post(`/${path}`, rowSchema, body),
    onSuccess: (saved) => {
      toast.success(`${saved.name} ${isEdit ? 'updated' : 'created'}.`);
      void queryClient.invalidateQueries({ queryKey: masterKey(path) });
      onSaved?.(saved);
      onOpenChange(false);
    },
    onError: (e) => {
      if (!(e instanceof ApiError)) return toast.error('Something went wrong.');
      if (e.statusCode === 409 && !e.message.startsWith('Product #')) {
        form.setError('name' as Path<z.input<S>>, { message: e.message });
      } else if (e.errors?.length) {
        for (const { path: field, message } of e.errors) {
          form.setError(field as Path<z.input<S>>, { message });
        }
      } else {
        toast.error(e.message);
      }
    },
  });

  const onSubmit = form.handleSubmit((values) => save.mutateAsync(values).catch(() => undefined));
  const title = `${isEdit ? 'Edit' : 'New'} ${noun}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {children(form)}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : isEdit ? 'Save' : `Create ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
