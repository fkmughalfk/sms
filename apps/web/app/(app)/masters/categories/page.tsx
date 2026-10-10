'use client';

import { categoryListSchema, categoryRowSchema, categorySchema, formatPercent } from '@sms/shared';
import { EntityDialog } from '@/components/master/entity-dialog';
import { TextField } from '@/components/master/fields';
import { MasterListPage } from '@/components/master/master-list-page';
import { percentRateSchema, rateToPercent } from '@/lib/masters';

const formSchema = categorySchema.extend({ commissionRate: percentRateSchema });

export default function CategoriesPage() {
  return (
    <MasterListPage
      title="Categories"
      description="A blank commission rate uses the default from Settings (0.35%)."
      path="categories"
      listSchema={categoryListSchema}
      managePermission="categories.manage"
      columns={[
        { header: 'Name', cell: (r) => r.name, sortKey: 'name' },
        {
          header: 'Commission',
          className: 'text-right',
          sortKey: 'commissionRate',
          numeric: true,
          cell: (r) =>
            r.commissionRate === null ? (
              <span className="text-muted-foreground">Default</span>
            ) : (
              formatPercent(r.commissionRate, 2)
            ),
        },
      ]}
      renderDialog={(props) => (
        <EntityDialog
          {...props}
          noun="category"
          path="categories"
          schema={formSchema}
          rowSchema={categoryRowSchema}
          defaults={(row) => ({
            name: row?.name ?? '',
            commissionRate: rateToPercent(row?.commissionRate),
          })}
          description="Changing a rate only affects invoices saved from now on — saved lines keep their rate."
        >
          {(form) => (
            <>
              <TextField form={form} name="name" label="Name" autoFocus />
              <TextField
                form={form}
                name="commissionRate"
                label="Commission % (blank = default)"
                inputMode="decimal"
                placeholder="e.g. 0.35"
              />
            </>
          )}
        </EntityDialog>
      )}
    />
  );
}
