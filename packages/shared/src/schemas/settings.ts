import { z } from 'zod';
import { commissionRateSchema, decimalSchema, nameSchema, optionalTextSchema } from './common';

/** `PATCH /settings` (SUPER_ADMIN). All fields optional. */
export const updateSettingsSchema = z
  .object({
    companyName: nameSchema(200),
    companyAddress: optionalTextSchema(500),
    defaultCommissionRate: commissionRateSchema,
    annualSalesTarget: decimalSchema({ maxDecimals: 2, min: 0, message: 'Enter a valid target.' }),
    fiscalYearStartMonth: z.coerce
      .number({ error: 'Choose a month.' })
      .int()
      .min(1, 'Choose a month.')
      .max(12, 'Choose a month.'),
    userEditWindowHours: z.coerce
      .number({ error: 'Enter hours (0–720).' })
      .int('Enter whole hours.')
      .min(0, 'Enter hours (0–720).')
      .max(24 * 30, 'Enter hours (0–720).'),
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
