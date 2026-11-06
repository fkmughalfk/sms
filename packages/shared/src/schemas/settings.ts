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
    defaultCreditDays: z.coerce
      .number({ error: 'Enter credit days (0–365).' })
      .int('Enter whole days.')
      .min(0, 'Enter credit days (0–365).')
      .max(365, 'Enter credit days (0–365).'),
    /** Orders are numbered from here, or after the highest order no., whichever is higher. */
    firstOrderNo: z.coerce
      .number({ error: 'Enter the first order number.' })
      .int('Enter a whole number.')
      .min(1, 'Enter the first order number.')
      .max(99_999_999, 'Enter the first order number.'),
    /** Invoices dated up to this day don't reduce opening orders (already in the old report). */
    ordersGoLiveDate: z.preprocess(
      (v) => (v === '' ? null : v),
      z.iso.date({ error: 'Enter a valid date.' }).nullable(),
    ),
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
  /** Credit days for parties without their own (Phase 2). */
  defaultCreditDays: z.number(),
  /** Orders module: numbering starts here (e.g. 3211 to continue the paper series). */
  firstOrderNo: z.number(),
  /** `YYYY-MM-DD` or null: invoice PDFs up to this date don't reduce opening orders. */
  ordersGoLiveDate: z.string().nullable(),
});
export type Settings = z.infer<typeof settingsSchema>;
