'use client';

import { citySchema, namedListSchema, namedRowSchema } from '@sms/shared';
import { EntityDialog } from '@/components/master/entity-dialog';
import { TextField } from '@/components/master/fields';
import { MasterListPage } from '@/components/master/master-list-page';

export default function CitiesPage() {
  return (
    <MasterListPage
      title="Cities"
      path="cities"
      listSchema={namedListSchema}
      columns={[{ header: 'Name', cell: (r) => r.name, sortKey: 'name' }]}
      renderDialog={(props) => (
        <EntityDialog
          {...props}
          noun="city"
          path="cities"
          schema={citySchema}
          rowSchema={namedRowSchema}
          defaults={(row) => ({ name: row?.name ?? '' })}
        >
          {(form) => <TextField form={form} name="name" label="Name" autoFocus />}
        </EntityDialog>
      )}
    />
  );
}
