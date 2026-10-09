'use client';

import { formatPKR2, partyListSchema, partyRowSchema, partySchema } from '@sms/shared';
import { useState } from 'react';
import { Combobox } from '@/components/combobox';
import { EntityDialog } from '@/components/master/entity-dialog';
import { ComboboxField, TextField } from '@/components/master/fields';
import { MasterListPage } from '@/components/master/master-list-page';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';

export default function PartiesPage() {
  const [cityId, setCityId] = useState<string | null>(null);
  const cities = useMasterOptions('cities');

  return (
    <MasterListPage
      title="Parties"
      description="Customers. The default city pre-fills new invoices."
      path="parties"
      listSchema={partyListSchema}
      filterParams={{ cityId: cityId ?? undefined }}
      filters={
        <div className="w-48">
          <Combobox
            options={toComboboxOptions(cities.data)}
            value={cityId}
            onChange={setCityId}
            placeholder="All cities"
            noneLabel="All cities"
          />
        </div>
      }
      columns={[
        { header: 'Name', cell: (r) => r.name },
        { header: 'City', cell: (r) => r.city?.name ?? '—' },
        { header: 'Phone', cell: (r) => r.phone ?? '—', className: 'hidden md:table-cell' },
        {
          header: 'Opening balance',
          cell: (r) => formatPKR2(r.openingBalance),
          className: 'text-right tabular-nums',
        },
      ]}
      renderDialog={(props) => (
        <EntityDialog
          {...props}
          noun="party"
          path="parties"
          schema={partySchema}
          rowSchema={partyRowSchema}
          defaults={(row) => ({
            name: row?.name ?? '',
            cityId: row?.cityId ?? null,
            phone: row?.phone ?? '',
            openingBalance: row?.openingBalance ?? '0',
          })}
        >
          {(form) => (
            <>
              <TextField form={form} name="name" label="Name" autoFocus />
              <ComboboxField
                form={form}
                name="cityId"
                label="Default city"
                options={toComboboxOptions(cities.data, props.row?.city)}
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
      )}
    />
  );
}
