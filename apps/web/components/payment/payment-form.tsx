'use client';

import {
  afterPayment,
  businessToday,
  dec,
  formatPKR2,
  formatPercent,
  partyOptionSchema,
  partyPositionSchema,
  type PaymentRow,
  paymentInputSchema,
  paymentRowSchema,
  subPartyOptionSchema,
} from '@sms/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Combobox } from '@/components/combobox';
import { FormField } from '@/components/form-field';
import { FormSection } from '@/components/form-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';
import { cn } from '@/lib/utils';

interface FormValues {
  paymentDate: string;
  partyId: string | null;
  subPartyId: string | null;
  slipNo: string;
  bankId: string | null;
  amount: string;
  remarks: string;
}

const emptyValues = (keep?: Pick<FormValues, 'paymentDate' | 'bankId'>): FormValues => ({
  paymentDate: keep?.paymentDate ?? businessToday(),
  partyId: null,
  subPartyId: null,
  slipNo: '',
  bankId: keep?.bankId ?? null,
  amount: '',
  remarks: '',
});

const fromRow = (p: PaymentRow): FormValues => ({
  paymentDate: p.paymentDate,
  partyId: p.party.id,
  subPartyId: p.subParty?.id ?? null,
  slipNo: p.slipNo ?? '',
  bankId: p.bank?.id ?? null,
  amount: p.amount,
  remarks: p.remarks ?? '',
});

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/** Payment entry (spec §5.4, replaces the Excel "Payments" sheet). */
export function PaymentForm({ payment }: { payment?: PaymentRow }) {
  const isEdit = payment !== undefined;
  const router = useRouter();
  const queryClient = useQueryClient();
  const parties = useMasterOptions('parties', z.array(partyOptionSchema));
  const banks = useMasterOptions('banks');

  const form = useForm<FormValues>({ defaultValues: payment ? fromRow(payment) : emptyValues() });
  const [partyId, amount] = useWatch({ control: form.control, name: ['partyId', 'amount'] });
  const subParties = useMasterOptions(
    'sub-parties',
    z.array(subPartyOptionSchema),
    partyId ? `?partyId=${partyId}` : '',
  );
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const saveAndNew = useRef(false);

  const position = useQuery({
    queryKey: ['recovery', 'position', partyId],
    queryFn: () => api.get(`/recovery/parties/${partyId}/position`, partyPositionSchema),
    enabled: !!partyId,
  });

  const isDirty = form.formState.isDirty;
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const save = useMutation({
    mutationFn: (body: unknown) =>
      isEdit
        ? api.patch(`/payments/${payment.id}`, paymentRowSchema, body)
        : api.post('/payments', paymentRowSchema, body),
    onSuccess: (saved) => {
      toast.success(`Payment of ${formatPKR2(saved.amount)} from ${saved.party.name} saved.`);
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['recovery'] });
      if (saveAndNew.current && !isEdit) {
        const { paymentDate, bankId } = form.getValues();
        form.reset(emptyValues({ paymentDate, bankId })); // keep date + bank for the next slip
        setErrors(new Map());
        setTimeout(() => document.getElementById('partyId')?.focus());
      } else {
        form.reset(form.getValues());
        router.push('/payments');
      }
    },
    onError: (e) => {
      if (!(e instanceof ApiError)) return toast.error('Could not reach the server.');
      if (e.errors?.length) setErrors(new Map(e.errors.map((x) => [x.path, x.message])));
      toast.error(e.message);
    },
  });

  const submit = (andNew: boolean) => {
    saveAndNew.current = andNew;
    const values = form.getValues();
    const parsed = paymentInputSchema.safeParse(values);
    if (!parsed.success) {
      const map = new Map(parsed.error.issues.map((i) => [i.path.join('.'), i.message]));
      setErrors(map);
      toast.error([...map.values()].join('\n'));
      return;
    }
    setErrors(new Map());
    save.mutate(values);
  };

  const onPartyChange = (id: string | null) => {
    form.setValue('partyId', id, { shouldDirty: true });
    form.setValue('subPartyId', null, { shouldDirty: true });
  };

  // "After this payment" (Payments G8). When editing, the saved amount is already in
  // "recovered", so add it back before subtracting the new amount.
  const typed = AMOUNT_RE.test(amount.trim()) ? amount.trim() : '0';
  const savedHere = isEdit && payment.party.id === partyId ? payment.amount : '0';
  const after = position.data
    ? afterPayment(dec(position.data.outstanding).plus(savedHere), typed)
    : null;

  const err = (path: string) => errors.get(path);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <form
        className="min-w-0"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <FormSection
          title="Payment details"
          icon={Wallet}
          tone="emerald"
          className="grid gap-3 sm:grid-cols-2"
        >
          <FormField id="paymentDate" label="Date" error={err('paymentDate')}>
            <Input
              id="paymentDate"
              type="date"
              aria-invalid={!!err('paymentDate')}
              {...form.register('paymentDate')}
            />
          </FormField>
          <FormField id="partyId" label="Party" error={err('partyId')}>
            <Combobox
              id="partyId"
              options={toComboboxOptions(parties.data, payment?.party)}
              value={partyId}
              onChange={onPartyChange}
              placeholder="Select party"
              aria-invalid={!!err('partyId')}
            />
          </FormField>
          <FormField id="subPartyId" label="Sub Party" error={err('subPartyId')}>
            <Controller
              control={form.control}
              name="subPartyId"
              render={({ field }) => (
                <Combobox
                  id="subPartyId"
                  options={toComboboxOptions(subParties.data, payment?.subParty)}
                  value={field.value}
                  onChange={field.onChange}
                  noneLabel="—"
                  placeholder="—"
                />
              )}
            />
          </FormField>
          <FormField id="bankId" label="Bank" error={err('bankId')}>
            <Controller
              control={form.control}
              name="bankId"
              render={({ field }) => (
                <Combobox
                  id="bankId"
                  options={toComboboxOptions(banks.data, payment?.bank)}
                  value={field.value}
                  onChange={field.onChange}
                  noneLabel="—"
                  placeholder="Select bank / Cash"
                />
              )}
            />
          </FormField>
          <FormField id="slipNo" label="Slip / Transaction No." error={err('slipNo')}>
            <Input id="slipNo" autoComplete="off" {...form.register('slipNo')} />
          </FormField>
          <FormField id="amount" label="Amount (PKR)" error={err('amount')}>
            <Input
              id="amount"
              inputMode="decimal"
              className="border-emerald-300 bg-emerald-50/50 text-right text-base font-semibold tabular-nums focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30 dark:border-emerald-500/40 dark:bg-emerald-500/10"
              aria-invalid={!!err('amount')}
              {...form.register('amount')}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="remarks" label="Remarks" error={err('remarks')}>
              <Input id="remarks" autoComplete="off" {...form.register('remarks')} />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="submit"
              className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25 hover:from-emerald-500 hover:to-teal-500"
              disabled={save.isPending}
            >
              {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Save'}
            </Button>
            {!isEdit && (
              <Button
                type="button"
                variant="secondary"
                disabled={save.isPending}
                onClick={() => submit(true)}
              >
                Save & new
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => router.push('/payments')}>
              Cancel
            </Button>
          </div>
        </FormSection>
      </form>

      {/* Party Position (Payments F5:G8) */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-teal-600 p-4 text-white">
            <div
              aria-hidden
              className="absolute -top-8 -right-8 size-24 rounded-full bg-white/15 blur-xl"
            />
            <p className="text-xs font-medium tracking-wide text-white/80 uppercase">
              Outstanding (PKR)
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
              {partyId && position.data ? formatPKR2(position.data.outstanding) : '—'}
            </p>
          </div>
          <div className="grid gap-3 p-4">
            <h2 className="sr-only">Party position</h2>
            {!partyId ? (
              <p className="text-sm text-muted-foreground">Choose a party to see what they owe.</p>
            ) : position.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : position.error ? (
              <p className="text-sm text-destructive">{position.error.message}</p>
            ) : (
              <dl className="grid gap-2 text-sm [&>div]:flex [&>div]:justify-between [&_dd]:font-medium [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
                {dec(position.data.openingBalance).isZero() ? null : (
                  <div>
                    <dt>Opening balance</dt>
                    <dd>{formatPKR2(position.data.openingBalance)}</dd>
                  </div>
                )}
                <div>
                  <dt>Invoiced</dt>
                  <dd>{formatPKR2(position.data.invoiced)}</dd>
                </div>
                <div>
                  <dt>Recovered so far</dt>
                  <dd>{formatPKR2(position.data.recovered)}</dd>
                </div>
                <div className="border-t pt-2">
                  <dt>Outstanding now</dt>
                  <dd className="text-base">{formatPKR2(position.data.outstanding)}</dd>
                </div>
                <div>
                  <dt>After this payment</dt>
                  <dd
                    className={cn(
                      'rounded-md px-1.5 text-base',
                      after?.lt(0)
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
                    )}
                  >
                    {after ? formatPKR2(after) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Recovered</dt>
                  <dd>{formatPercent(position.data.recoveryRate, 1)}</dd>
                </div>
                <div>
                  <dt>Last payment</dt>
                  <dd>{position.data.lastPaymentDate?.split('-').reverse().join('-') ?? '—'}</dd>
                </div>
              </dl>
            )}
            {after?.lt(0) && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                This payment is more than the party owes — it will show as an advance.
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
