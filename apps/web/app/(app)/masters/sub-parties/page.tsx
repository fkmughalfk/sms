'use client';

import {
  partyOptionSchema,
  subPartyListSchema,
  subPartyRowSchema,
  subPartySchema,
} from '@sms/shared';
import { useState } from 'react';
import { z } from 'zod';
import { Combobox } from '@/components/combobox';
import { EntityDialog } from '@/components/master/entity-dialog';
import { ComboboxField, TextField } from '@/components/master/fields';
import { MasterListPage } from '@/components/master/master-list-page';
import { toComboboxOptions, useMasterOptions } from '@/lib/masters';

const partyOptionsSchema = z.array(partyOptionSchema);

export default function SubPartiesPage() {
  const [partyId, setPartyId] = useState<string | null>(null);
  const parties = useMasterOptions('parties', partyOptionsSchema);

  return (
    <MasterListPage
      title="Sub-parties"
      description="Unassigned sub-parties can be used with any party."
      path="sub-parties"
      listSchema={subPartyListSchema}
      filterParams={{ partyId: partyId ?? undefined }}
      filters={
        <div className="w-56">
          <Combobox
            options={toComboboxOptions(parties.data)}
            value={partyId}
            onChange={setPartyId}
            placeholder="All parties"
            noneLabel="All parties"
          />
        </div>
      }
      columns={[
        { header: 'Name', cell: (r) => r.name },
        {
          header: 'Party',
          cell: (r) => r.party?.name ?? <span className="text-muted-foreground">Unassigned</span>,
        },
      ]}
      renderDialog={(props) => (
        <EntityDialog
          {...props}
          noun="sub-party"
          path="sub-parties"
          schema={subPartySchema}
          rowSchema={subPartyRowSchema}
          defaults={(row) => ({ name: row?.name ?? '', partyId: row?.partyId ?? null })}
        >
          {(form) => (
            <>
              <TextField form={form} name="name" label="Name" autoFocus />
              <ComboboxField
                form={form}
                name="partyId"
                label="Parent party"
                options={toComboboxOptions(parties.data, props.row?.party)}
                noneLabel="Unassigned (any party)"
                placeholder="Unassigned (any party)"
              />
            </>
          )}
        </EntityDialog>
      )}
    />
  );
}
