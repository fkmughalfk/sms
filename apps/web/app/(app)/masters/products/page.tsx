'use client';

import {
  formatKg,
  formatPercent,
  packWeightKg,
  productListSchema,
  productRowSchema,
  productSchema,
} from '@sms/shared';
import { useState } from 'react';
import { type Control, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { Combobox } from '@/components/combobox';
import { EntityDialog } from '@/components/master/entity-dialog';
import { ComboboxField, TextField } from '@/components/master/fields';
import { MasterListPage } from '@/components/master/master-list-page';
import {
  percentRateSchema,
  rateToPercent,
  toComboboxOptions,
  useMasterOptions,
} from '@/lib/masters';

const formSchema = productSchema.extend({ commissionRate: percentRateSchema });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

/** Read-only "Pack Wt (KG)" preview = unit weight × pcs (spec §5.6). */
function PackWeightPreview({ control }: { control: Control<FormInput, unknown, FormOutput> }) {
  const [unit, pcs] = useWatch({ control, name: ['unitWeightKg', 'packPcs'] });
  let text = '—';
  try {
    const n = Number(pcs);
    if (String(unit ?? '').trim() && Number.isInteger(n) && n > 0) {
      text = `${formatKg(packWeightKg(String(unit).trim(), n))} KG`;
    }
  } catch {
    // incomplete input
  }
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">Pack weight</span>
      <span className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm">{text}</span>
    </div>
  );
}

export default function ProductsPage() {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const categories = useMasterOptions('categories');
  const categoryOptions = toComboboxOptions(categories.data);

  return (
    <MasterListPage
      title="Products"
      path="products"
      listSchema={productListSchema}
      searchPlaceholder="Search name or product #…"
      filterParams={{ categoryId: categoryId ?? undefined }}
      filters={
        <div className="w-48">
          <Combobox
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            placeholder="All categories"
            noneLabel="All categories"
          />
        </div>
      }
      columns={[
        { header: '#', cell: (r) => r.sku, className: 'w-16 tabular-nums', sortKey: 'sku' },
        { header: 'Name', cell: (r) => r.name, sortKey: 'name' },
        { header: 'Category', cell: (r) => r.category.name, sortKey: 'category' },
        {
          header: 'Unit (KG)',
          cell: (r) => formatKg(r.unitWeightKg),
          className: 'text-right tabular-nums',
          sortKey: 'unitWeightKg',
          numeric: true,
        },
        {
          header: 'Pcs',
          cell: (r) => r.packPcs,
          className: 'text-right tabular-nums',
          sortKey: 'packPcs',
          numeric: true,
        },
        {
          header: 'Pack (KG)',
          cell: (r) => formatKg(r.packWeightKg),
          className: 'text-right tabular-nums',
        },
        {
          header: 'Commission',
          className: 'text-right tabular-nums',
          cell: (r) => (
            <span title={r.commissionRate ? 'Product override' : 'From category / settings'}>
              {formatPercent(r.effectiveCommissionRate, 2)}
              {r.commissionRate && <span className="ml-1 text-xs text-muted-foreground">*</span>}
            </span>
          ),
        },
      ]}
      renderDialog={(props) => (
        <EntityDialog
          {...props}
          noun="product"
          path="products"
          schema={formSchema}
          rowSchema={productRowSchema}
          defaults={(row) => ({
            sku: row?.sku ?? ('' as unknown as number),
            name: row?.name ?? '',
            unitWeightKg: row?.unitWeightKg ?? '',
            packPcs: row?.packPcs ?? 1,
            categoryId: row?.categoryId ?? '',
            commissionRate: rateToPercent(row?.commissionRate),
          })}
          description="Weight and commission are copied onto each invoice line when it is saved, so editing a product never changes old invoices."
        >
          {(form) => (
            <>
              <div className="grid grid-cols-[6rem_1fr] gap-3">
                <TextField form={form} name="sku" label="Product #" inputMode="numeric" />
                <TextField form={form} name="name" label="Name" autoFocus />
              </div>
              <ComboboxField
                form={form}
                name="categoryId"
                label="Category"
                options={toComboboxOptions(categories.data, props.row?.category)}
                placeholder="Select a category"
              />
              <div className="grid grid-cols-3 gap-3">
                <TextField
                  form={form}
                  name="unitWeightKg"
                  label="Unit weight (KG)"
                  inputMode="decimal"
                />
                <TextField form={form} name="packPcs" label="Pack (pcs)" inputMode="numeric" />
                <PackWeightPreview control={form.control} />
              </div>
              <TextField
                form={form}
                name="commissionRate"
                label="Commission % override (blank = category rate)"
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
