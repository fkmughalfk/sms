import { z } from 'zod';

// Prompt-payment discount credits (docs/ORDERS_DELIVERY_SPEC.md §6, phase O6).

export const DISCOUNT_STATUSES = ['ACTIVE', 'REVERSED'] as const;

export const discountCreditSchema = z.object({
  id: z.string(),
  invoice: z.object({ id: z.string(), invoiceNo: z.number(), invoiceDate: z.string() }),
  amount: z.string(),
  /** The day the invoice was cleared (the ledger date). */
  creditDate: z.string(),
  status: z.enum(DISCOUNT_STATUSES),
  reversedReason: z.string().nullable(),
  reversedBy: z.string().nullable(),
});
export type DiscountCredit = z.infer<typeof discountCreditSchema>;

/** `GET /discounts?partyId=` — credits, plus invoices that can still earn one. */
export const partyDiscountsSchema = z.object({
  credits: z.array(discountCreditSchema),
  /** Unpaid invoices with a discount still on offer, and the last day to clear them. */
  eligible: z.array(
    z.object({
      invoiceId: z.string(),
      invoiceNo: z.number(),
      invoiceDate: z.string(),
      discount: z.string(),
      payBy: z.string(),
    }),
  ),
});
export type PartyDiscounts = z.infer<typeof partyDiscountsSchema>;

export const discountReverseSchema = z.object({
  reason: z.string({ error: 'Give a reason.' }).trim().min(1, 'Give a reason.').max(500),
});
