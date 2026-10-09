import { z } from 'zod';
import {
  commissionRateSchema,
  masterListQuerySchema,
  paginatedSchema,
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
  sku: z.coerce.number({ error: 'Enter the product #.' }).int().positive('Enter the product #.'),
  name: nameSchema(200),
  unitWeightKg: decimalSchema({
    maxDecimals: 3,
    min: 0,
    exclusiveMin: true,
    message: 'Enter the unit weight (KG).',
  }),
  packPcs: z.coerce
    .number({ error: 'Enter pieces per pack.' })
    .int()
    .min(1, 'Enter pieces per pack.'),
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

// ── List filters ──

export const productListQuerySchema = masterListQuerySchema.extend({
  categoryId: z.string().trim().min(1).optional(),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const partyListQuerySchema = masterListQuerySchema.extend({
  cityId: z.string().trim().min(1).optional(),
});
export type PartyListQuery = z.infer<typeof partyListQuerySchema>;

export const subPartyListQuerySchema = masterListQuerySchema.extend({
  partyId: z.string().trim().min(1).optional(),
});
export type SubPartyListQuery = z.infer<typeof subPartyListQuerySchema>;

/** `GET /sub-parties/options?partyId=` → that party's sub-parties + unassigned ones (spec §5.2). */
export const subPartyOptionsQuerySchema = z.object({
  partyId: z.string().trim().min(1).optional(),
});
export type SubPartyOptionsQuery = z.infer<typeof subPartyOptionsQuerySchema>;

// ── Responses (decimals are strings) ──

const ref = z.object({ id: z.string(), name: z.string() });

/** Row shape for `GET /x/options` dropdowns (active records only). */
export const masterOptionSchema = ref;
export type MasterOption = z.infer<typeof masterOptionSchema>;
export const masterOptionsSchema = z.array(masterOptionSchema);

export const categoryRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  commissionRate: z.string().nullable(),
  isActive: z.boolean(),
});
export type CategoryRow = z.infer<typeof categoryRowSchema>;

export const productRowSchema = z.object({
  id: z.string(),
  sku: z.number(),
  name: z.string(),
  unitWeightKg: z.string(),
  packPcs: z.number(),
  /** unitWeightKg × packPcs (spec §6.1) — derived, not stored. */
  packWeightKg: z.string(),
  categoryId: z.string(),
  category: ref,
  /** Per-product override; null → category rate → settings default. */
  commissionRate: z.string().nullable(),
  /** The rate an invoice line would snapshot today. */
  effectiveCommissionRate: z.string(),
  isActive: z.boolean(),
});
export type ProductRow = z.infer<typeof productRowSchema>;

export const productOptionSchema = ref.extend({
  sku: z.number(),
  packWeightKg: z.string(),
  effectiveCommissionRate: z.string(),
  categoryId: z.string(),
});
export type ProductOption = z.infer<typeof productOptionSchema>;

export const partyRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  cityId: z.string().nullable(),
  city: ref.nullable(),
  phone: z.string().nullable(),
  openingBalance: z.string(),
  isActive: z.boolean(),
});
export type PartyRow = z.infer<typeof partyRowSchema>;

/** Party dropdown row; `cityId` pre-fills the invoice city (spec §5.2). */
export const partyOptionSchema = ref.extend({ cityId: z.string().nullable() });
export type PartyOption = z.infer<typeof partyOptionSchema>;

export const subPartyRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  partyId: z.string().nullable(),
  party: ref.nullable(),
  isActive: z.boolean(),
});
export type SubPartyRow = z.infer<typeof subPartyRowSchema>;

export const subPartyOptionSchema = ref.extend({ partyId: z.string().nullable() });
export type SubPartyOption = z.infer<typeof subPartyOptionSchema>;

/** City, bank. */
export const namedRowSchema = z.object({ id: z.string(), name: z.string(), isActive: z.boolean() });
export type NamedRow = z.infer<typeof namedRowSchema>;

export const salespersonRowSchema = namedRowSchema.extend({ phone: z.string().nullable() });
export type SalespersonRow = z.infer<typeof salespersonRowSchema>;

export const categoryListSchema = paginatedSchema(categoryRowSchema);
export const productListSchema = paginatedSchema(productRowSchema);
export const partyListSchema = paginatedSchema(partyRowSchema);
export const subPartyListSchema = paginatedSchema(subPartyRowSchema);
export const namedListSchema = paginatedSchema(namedRowSchema);
export const salespersonListSchema = paginatedSchema(salespersonRowSchema);
