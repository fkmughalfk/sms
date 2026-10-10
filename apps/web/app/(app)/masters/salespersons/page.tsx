'use client';

import { salespersonListSchema, salespersonRowSchema, salespersonSchema } from '@sms/shared';
import { EntityDialog } from '@/components/master/entity-dialog';
import { TextField } from '@/components/master/fields';
import { MasterListPage } from '@/components/master/master-list-page';

export default function SalespersonsPage() {
  return (
    <MasterListPage
      title="Salespersons (ASM)"
      path="salespersons"
      listSchema={salespersonListSchema}
      columns={[
        { header: 'Name', cell: (r) => r.name, sortKey: 'name' },
        { header: 'Phone', cell: (r) => r.phone ?? '—', sortKey: 'phone' },
      ]}
      renderDialog={(props) => (
        <EntityDialog
          {...props}
          noun="salesperson"
          path="salespersons"
          schema={salespersonSchema}
          rowSchema={salespersonRowSchema}
          defaults={(row) => ({ name: row?.name ?? '', phone: row?.phone ?? '' })}
        >
          {(form) => (
            <>
              <TextField form={form} name="name" label="Name" autoFocus />
              <TextField form={form} name="phone" label="Phone" inputMode="tel" />
            </>
          )}
        </EntityDialog>
      )}
    />
  );
}
