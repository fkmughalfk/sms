import { z } from 'zod';
import { dateStringSchema, decimalSchema, optionalIdSchema, optionalTextSchema } from './common';

// Payment / recovery entry (spec §5.4). Messages from the Excel VBA `SavePayment`.

const paymentBase = z.object({
  paymentDate: dateStringSchema('Enter a date.'),
  partyId: z.string({ error: 'Select a party.' }).trim().min(1, 'Select a party.'),
  subPartyId: optionalIdSchema,
  slipNo: optionalTextSchema(60),
  bankId: optionalIdSchema,
  amount: decimalSchema({
    maxDecimals: 2,
    min: 0,
    exclusiveMin: true,
    message: 'Enter a valid amount.',
  }),
  remarks: optionalTextSchema(500),
});

/** `POST /payments`. */
export const paymentInputSchema = paymentBase;
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type PaymentFormValues = z.input<typeof paymentInputSchema>;

/** `PATCH /payments/:id` (ADMIN+). */
export const updatePaymentSchema = paymentBase.partial();
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
