'use client';

import { formatPKR2, partyListSchema } from '@sms/shared';
import { useState } from 'react';
import { Combobox } from '@/components/combobox';
import { MasterListPage } from '@/components/master/master-list-page';
import { PartyDialog } from '@/components/master/party-dialog';
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
        { header: 'Name', cell: (r) => r.name, sortKey: 'name' },
        { header: 'City', cell: (r) => r.city?.name ?? '—', sortKey: 'city' },
        {
          header: 'Phone',
          cell: (r) => r.phone ?? '—',
          className: 'hidden md:table-cell',
          sortKey: 'phone',
        },
        {
          header: 'Opening balance',
          cell: (r) => formatPKR2(r.openingBalance),
          className: 'text-right tabular-nums',
          sortKey: 'openingBalance',
          numeric: true,
        },
      ]}
      renderDialog={(props) => <PartyDialog {...props} />}
    />
  );
}
