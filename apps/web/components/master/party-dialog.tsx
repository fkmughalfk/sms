'use client';

import { type PartyRow, partyRowSchema, partySchema } from '@sms/shared';
import { EntityDialog } from '@/components/master/entity-dialog';
import { ComboboxField, TextField } from '@/components/master/fields';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';

/** Create/edit a party — used by the Parties screen and "+ Add party" on invoices. */
export function PartyDialog({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: PartyRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (row: PartyRow) => void;
}) {
  const cities = useMasterOptions('cities');
  return (
    <EntityDialog
      row={row}
      open={open}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
      noun="party"
      path="parties"
      schema={partySchema}
      rowSchema={partyRowSchema}
      defaults={(r) => ({
        name: r?.name ?? '',
        cityId: r?.cityId ?? null,
        phone: r?.phone ?? '',
        openingBalance: r?.openingBalance ?? '0',
      })}
    >
      {(form) => (
        <>
          <TextField form={form} name="name" label="Name" autoFocus />
          <ComboboxField
            form={form}
            name="cityId"
            label="Default city"
            options={toComboboxOptions(cities.data, row?.city)}
            noneLabel="No default city"
            placeholder="No default city"
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField form={form} name="phone" label="Phone" inputMode="tel" />
            <TextField
              form={form}
              name="openingBalance"
              label="Opening balance (PKR)"
              inputMode="decimal"
            />
          </div>
        </>
      )}
    </EntityDialog>
  );
}
