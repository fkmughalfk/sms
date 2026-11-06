'use client';

import { SLIP_METHODS, type SlipDetails } from '@sms/shared';
import { Combobox } from '@/components/combobox';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';

/** The slip's details as the form edits them (strings; validated by the shared schema). */
export interface SlipValues {
  partyId: string | null;
  paymentDate: string;
  amount: string;
  bankId: string | null;
  slipNo: string;
  depositor: string;
  method: (typeof SLIP_METHODS)[number] | '';
  remarks: string;
}

export const toSlipBody = (v: SlipValues): Record<string, unknown> => ({
  partyId: v.partyId ?? '',
  paymentDate: v.paymentDate,
  amount: v.amount.replace(/,/g, '').trim(),
  bankId: v.bankId,
  slipNo: v.slipNo,
  depositor: v.depositor,
  method: v.method || null,
  remarks: v.remarks,
});

export const fromDetails = (d: SlipDetails | Record<string, unknown>): SlipValues => {
  const x = d as Partial<Record<keyof SlipValues, string | null>>;
  return {
    partyId: (x.partyId as string) ?? null,
    paymentDate: (x.paymentDate as string) ?? '',
    amount: (x.amount as string) ?? '',
    bankId: (x.bankId as string) ?? null,
    slipNo: (x.slipNo as string) ?? '',
    depositor: (x.depositor as string) ?? '',
    method: ((x.method as string) ?? '') as SlipValues['method'],
    remarks: (x.remarks as string) ?? '',
  };
};

const METHOD_LABEL = { CASH: 'Cash deposit', TRANSFER: 'Bank transfer', CHEQUE: 'Cheque' } as const;

/** Party (chosen by the uploader), date, amount, bank, reference, depositor and method. */
export function SlipFields({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: SlipValues;
  onChange: (v: SlipValues) => void;
  errors: Map<string, string>;
  disabled?: boolean;
}) {
  const parties = useMasterOptions('parties');
  const banks = useMasterOptions('banks');
  const set = (patch: Partial<SlipValues>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="partyId" label="Party (who paid)" error={errors.get('details.partyId')}>
        <Combobox
          id="partyId"
          options={toComboboxOptions(parties.data)}
          value={value.partyId}
          onChange={(v) => set({ partyId: v })}
          placeholder="Choose the party…"
          disabled={disabled}
        />
      </FormField>
      <FormField
        id="paymentDate"
        label="Date on the slip"
        error={errors.get('details.paymentDate')}
      >
        <Input
          id="paymentDate"
          type="date"
          value={value.paymentDate}
          disabled={disabled}
          onChange={(e) => set({ paymentDate: e.target.value })}
        />
      </FormField>
      <FormField id="amount" label="Amount (Rs)" error={errors.get('details.amount')}>
        <Input
          id="amount"
          inputMode="decimal"
          value={value.amount}
          disabled={disabled}
          className="text-right tabular-nums"
          onChange={(e) => set({ amount: e.target.value })}
        />
      </FormField>
      <FormField id="bankId" label="Paid into (bank)" error={errors.get('details.bankId')}>
        <Combobox
          id="bankId"
          options={toComboboxOptions(banks.data)}
          value={value.bankId}
          onChange={(v) => set({ bankId: v })}
          noneLabel="No bank / cash in hand"
          placeholder="Choose the bank…"
          disabled={disabled}
        />
      </FormField>
      <FormField
        id="slipNo"
        label="Bank reference (TT… / STAN)"
        error={errors.get('details.slipNo')}
      >
        <Input
          id="slipNo"
          value={value.slipNo}
          disabled={disabled}
          placeholder="e.g. TT26309… or STAN 727970"
          onChange={(e) => set({ slipNo: e.target.value })}
        />
      </FormField>
      <FormField id="depositor" label="Deposited by" error={errors.get('details.depositor')}>
        <Input
          id="depositor"
          value={value.depositor}
          disabled={disabled}
          onChange={(e) => set({ depositor: e.target.value })}
        />
      </FormField>
      <FormField id="method" label="How" error={errors.get('details.method')}>
        <select
          id="method"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          value={value.method}
          disabled={disabled}
          onChange={(e) => set({ method: e.target.value as SlipValues['method'] })}
        >
          <option value="">—</option>
          {SLIP_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="remarks" label="Remarks" error={errors.get('details.remarks')}>
        <Input
          id="remarks"
          value={value.remarks}
          disabled={disabled}
          onChange={(e) => set({ remarks: e.target.value })}
        />
      </FormField>
    </div>
  );
}
