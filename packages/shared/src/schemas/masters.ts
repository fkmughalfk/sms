import { z } from 'zod';
import {
  commissionRateSchema,
  decimalSchema,
  nameSchema,
  optionalIdSchema,
  optionalTextSchema,
} from './common';

// Master data (spec §5.6). Update schemas are partial; `isActive` changes go through `statusSchema`.

const optionalCommissionRate = commissionRateSchema.nullish().transform((v) => v ?? null);
const phoneSchema = optionalTextSchema(30);

export const categorySchema = z.object({
  name: nameSchema(),
  /** null → use Setting.defaultCommissionRate */
  commissionRate: optionalCommissionRate,
});
export type CategoryInput = z.infer<typeof categorySchema>;
export const updateCategorySchema = categorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

const productBase = z.object({
  sku: z.number({ error: 'Enter the product #.' }).int().positive('Enter the product #.'),
  name: nameSchema(200),
  unitWeightKg: decimalSchema({
    maxDecimals: 3,
    min: 0,
    exclusiveMin: true,
    message: 'Enter the unit weight (KG).',
  }),
  packPcs: z.number({ error: 'Enter pieces per pack.' }).int().min(1, 'Enter pieces per pack.'),
  categoryId: z.string({ error: 'Select a category.' }).trim().min(1, 'Select a category.'),
  /** Optional per-product override. */
  commissionRate: optionalCommissionRate,
});
// Defaults only on create — `.partial()` would otherwise re-apply them on PATCH.
export const productSchema = productBase.extend({ packPcs: productBase.shape.packPcs.default(1) });
export type ProductInput = z.infer<typeof productSchema>;
export const updateProductSchema = productBase.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

const partyBase = z.object({
  name: nameSchema(),
  cityId: optionalIdSchema,
  phone: phoneSchema,
  openingBalance: decimalSchema({ maxDecimals: 2, message: 'Enter a valid opening balance.' }),
});
export const partySchema = partyBase.extend({
  openingBalance: partyBase.shape.openingBalance.default('0'),
});
export type PartyInput = z.infer<typeof partySchema>;
export const updatePartySchema = partyBase.partial();
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;

export const subPartySchema = z.object({
  name: nameSchema(),
  partyId: optionalIdSchema,
});
export type SubPartyInput = z.infer<typeof subPartySchema>;
export const updateSubPartySchema = subPartySchema.partial();
export type UpdateSubPartyInput = z.infer<typeof updateSubPartySchema>;

export const citySchema = z.object({ name: nameSchema() });
export type CityInput = z.infer<typeof citySchema>;
export const updateCitySchema = citySchema.partial();
export type UpdateCityInput = z.infer<typeof updateCitySchema>;

export const salespersonSchema = z.object({ name: nameSchema(), phone: phoneSchema });
export type SalespersonInput = z.infer<typeof salespersonSchema>;
export const updateSalespersonSchema = salespersonSchema.partial();
export type UpdateSalespersonInput = z.infer<typeof updateSalespersonSchema>;

export const bankSchema = z.object({ name: nameSchema() });
export type BankInput = z.infer<typeof bankSchema>;
export const updateBankSchema = bankSchema.partial();
export type UpdateBankInput = z.infer<typeof updateBankSchema>;

/** Row shape for `GET /x/options` dropdowns. */
export interface MasterOption {
  id: string;
  name: string;
}
