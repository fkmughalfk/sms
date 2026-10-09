'use client';

import type { ComponentProps } from 'react';
import { Controller, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { Combobox, type ComboboxOption } from '@/components/combobox';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';

type FieldProps<T extends FieldValues> = {
  form: UseFormReturn<T, unknown, unknown>;
  name: Path<T>;
  label: string;
};

function errorOf<T extends FieldValues>(form: UseFormReturn<T, unknown, unknown>, name: Path<T>) {
  const error = name
    .split('.')
    .reduce<unknown>(
      (acc, key) => (acc as Record<string, unknown> | undefined)?.[key],
      form.formState.errors,
    ) as { message?: string } | undefined;
  return error?.message;
}

/** Labelled text input bound to the form. */
export function TextField<T extends FieldValues>({
  form,
  name,
  label,
  ...input
}: FieldProps<T> & Omit<ComponentProps<typeof Input>, 'name' | 'form'>) {
  return (
    <FormField id={name} label={label} error={errorOf(form, name)}>
      <Input id={name} autoComplete="off" {...input} {...form.register(name)} />
    </FormField>
  );
}

/** Labelled searchable select bound to the form. */
export function ComboboxField<T extends FieldValues>({
  form,
  name,
  label,
  options,
  noneLabel,
  placeholder,
}: FieldProps<T> & { options: ComboboxOption[]; noneLabel?: string; placeholder?: string }) {
  return (
    <FormField id={name} label={label} error={errorOf(form, name)}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Combobox
            id={name}
            options={options}
            value={field.value as string | null}
            onChange={field.onChange}
            noneLabel={noneLabel}
            placeholder={placeholder}
          />
        )}
      />
    </FormField>
  );
}
