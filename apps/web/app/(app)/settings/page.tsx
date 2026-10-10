'use client';

import {
  formatPKR,
  monthlyTarget,
  type Settings,
  settingsSchema,
  updateSettingsSchema,
} from '@sms/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { percentRateSchema, rateToPercent } from '@/lib/masters';
import { useSettings } from '@/lib/use-invoice';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface FormValues {
  companyName: string;
  companyAddress: string;
  defaultCommissionPercent: string;
  annualSalesTarget: string;
  fiscalYearStartMonth: string;
  userEditWindowHours: string;
}

const toForm = (s: Settings): FormValues => ({
  companyName: s.companyName,
  companyAddress: s.companyAddress,
  defaultCommissionPercent: rateToPercent(s.defaultCommissionRate),
  annualSalesTarget: s.annualSalesTarget,
  fiscalYearStartMonth: String(s.fiscalYearStartMonth),
  userEditWindowHours: String(s.userEditWindowHours),
});

/** Spec §5.8 — SUPER_ADMIN only (the layout blocks other roles). */
export default function SettingsPage() {
  const settings = useSettings();
  if (settings.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (settings.error) return <p className="text-sm text-destructive">{settings.error.message}</p>;
  // Mount the form with the saved values, so selects start filled and "changed" is accurate.
  return <SettingsForm settings={settings.data} />;
}

function SettingsForm({ settings }: { settings: Settings }) {
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ defaultValues: toForm(settings) });
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const target = useWatch({ control: form.control, name: 'annualSalesTarget' });

  const save = useMutation({
    mutationFn: (body: unknown) => api.patch('/settings', settingsSchema, body),
    onSuccess: (saved) => {
      toast.success('Settings saved.');
      queryClient.setQueryData(['settings'], saved);
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: ['masters', 'products'] });
      form.reset(toForm(saved));
    },
    onError: (e) => {
      if (e instanceof ApiError && e.errors?.length) {
        setErrors(new Map(e.errors.map((x) => [x.path, x.message])));
      }
      toast.error(e instanceof ApiError ? e.message : 'Could not save.');
    },
  });

  const onSubmit = form.handleSubmit((v) => {
    const rate = percentRateSchema.safeParse(v.defaultCommissionPercent);
    const body = {
      companyName: v.companyName,
      companyAddress: v.companyAddress,
      defaultCommissionRate: rate.success ? (rate.data ?? '') : v.defaultCommissionPercent,
      annualSalesTarget: v.annualSalesTarget,
      fiscalYearStartMonth: v.fiscalYearStartMonth,
      userEditWindowHours: v.userEditWindowHours,
    };
    const parsed = updateSettingsSchema.safeParse(body);
    const map = new Map<string, string>();
    if (!rate.success || rate.data === null) {
      map.set('defaultCommissionRate', 'Enter a percentage between 0 and 100 (e.g. 0.35).');
    }
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const key = String(i.path[0]);
        if (!map.has(key)) map.set(key, i.message);
      }
    }
    setErrors(map);
    if (map.size === 0) save.mutate(body);
  });

  const err = (k: string) => errors.get(k);

  return (
    <div className="grid max-w-2xl gap-4">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Company details, rates and targets.</p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-6" noValidate>
        <section className="grid gap-4 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Company</h2>
          <p className="-mt-2 text-xs text-muted-foreground">
            Shown in the header and on printed invoices and ledgers.
          </p>
          <FormField id="companyName" label="Company name" error={err('companyName')}>
            <Input id="companyName" {...form.register('companyName')} />
          </FormField>
          <FormField id="companyAddress" label="Address" error={err('companyAddress')}>
            <Input id="companyAddress" {...form.register('companyAddress')} />
          </FormField>
        </section>

        <section className="grid gap-4 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Sales</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="defaultCommissionPercent"
              label="Default commission %"
              error={err('defaultCommissionRate')}
            >
              <Input
                id="defaultCommissionPercent"
                inputMode="decimal"
                placeholder="0.35"
                {...form.register('defaultCommissionPercent')}
              />
            </FormField>
            <FormField
              id="annualSalesTarget"
              label="Annual sales target (PKR)"
              error={err('annualSalesTarget')}
            >
              <Input
                id="annualSalesTarget"
                inputMode="decimal"
                {...form.register('annualSalesTarget')}
              />
            </FormField>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            The default rate is used by categories and products without their own rate, for invoices
            saved from now on — saved invoices keep their rate.
            {/^\d+(\.\d{1,2})?$/.test(target ?? '') &&
              ` Monthly target: PKR ${formatPKR(monthlyTarget(target))}.`}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="fiscalYearStartMonth"
              label="Fiscal year starts in"
              error={err('fiscalYearStartMonth')}
            >
              <Controller
                control={form.control}
                name="fiscalYearStartMonth"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="fiscalYearStartMonth" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField
              id="userEditWindowHours"
              label="Users may edit their invoices for (hours)"
              error={err('userEditWindowHours')}
            >
              <Input
                id="userEditWindowHours"
                inputMode="numeric"
                {...form.register('userEditWindowHours')}
              />
            </FormField>
          </div>
        </section>

        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!form.formState.isDirty}
            onClick={() => {
              form.reset(toForm(settings));
              setErrors(new Map());
            }}
          >
            Discard changes
          </Button>
        </div>
      </form>
    </div>
  );
}
