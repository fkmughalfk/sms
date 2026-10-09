import { z } from 'zod';
import { commissionRateSchema, decimalSchema, nameSchema, optionalTextSchema } from './common';

/** `PATCH /settings` (SUPER_ADMIN). All fields optional. */
export const updateSettingsSchema = z
  .object({
    companyName: nameSchema(200),
    companyAddress: optionalTextSchema(500),
    defaultCommissionRate: commissionRateSchema,
    annualSalesTarget: decimalSchema({ maxDecimals: 2, min: 0, message: 'Enter a valid target.' }),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
    userEditWindowHours: z
      .number()
      .int()
      .min(0)
      .max(24 * 30),
  })
  .partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** `GET /settings` (any signed-in user — company header, rates, targets). */
export const settingsSchema = z.object({
  companyName: z.string(),
  companyAddress: z.string(),
  defaultCommissionRate: z.string(),
  annualSalesTarget: z.string(),
  fiscalYearStartMonth: z.number(),
  userEditWindowHours: z.number(),
});
export type Settings = z.infer<typeof settingsSchema>;
