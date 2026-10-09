'use client';

import { bankSchema, namedListSchema, namedRowSchema } from '@sms/shared';
import { EntityDialog } from '@/components/master/entity-dialog';
import { TextField } from '@/components/master/fields';
import { MasterListPage } from '@/components/master/master-list-page';

export default function BanksPage() {
  return (
    <MasterListPage
      title="Banks"
      description="Payment accounts. Add “Cash” for cash receipts."
      path="banks"
      listSchema={namedListSchema}
      columns={[{ header: 'Name', cell: (r) => r.name }]}
      renderDialog={(props) => (
        <EntityDialog
          {...props}
          noun="bank"
          path="banks"
          schema={bankSchema}
          rowSchema={namedRowSchema}
          defaults={(row) => ({ name: row?.name ?? '' })}
        >
          {(form) => <TextField form={form} name="name" label="Name" autoFocus />}
        </EntityDialog>
      )}
    />
  );
}
