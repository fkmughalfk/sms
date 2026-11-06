import { z } from 'zod';
import { optionalTextSchema } from './common';
import { paymentInputSchema } from './payments';

// Payment slips (docs/ORDERS_DELIVERY_SPEC.md §5, phase O5): a photo or screenshot of a
// bank deposit / transfer, with the payment details read from it. The office's slips are
// saved as payments at once; a salesman's wait for the office to confirm.

export const SLIP_STATUSES = ['TO_CONFIRM', 'SAVED', 'REJECTED'] as const;
export type SlipStatus = (typeof SLIP_STATUSES)[number];

export const SLIP_METHODS = ['CASH', 'TRANSFER', 'CHEQUE'] as const;

/** What the slip says — the payment, plus who deposited it and how. */
export const slipDetailsSchema = paymentInputSchema.extend({
  depositor: optionalTextSchema(120),
  method: z
    .enum(SLIP_METHODS)
    .nullish()
    .transform((v) => v ?? null),
});
export type SlipDetails = z.infer<typeof slipDetailsSchema>;

/** Upload (multipart: `file` + these as a JSON string `details`) and confirm. */
export const slipSubmitSchema = z.object({
  details: slipDetailsSchema,
  /** Save even though it looks like a payment already recorded. */
  allowDuplicate: z.boolean().default(false),
});
export type SlipSubmit = z.infer<typeof slipSubmitSchema>;

export const slipRejectSchema = z.object({
  reason: z.string({ error: 'Give a reason.' }).trim().min(1, 'Give a reason.').max(500),
});

export const slipQuerySchema = z.object({
  status: z.enum(SLIP_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type SlipQuery = z.infer<typeof slipQuerySchema>;

const ref = z.object({ id: z.string(), name: z.string() });

export const slipDuplicateSchema = z.object({
  paymentId: z.string(),
  paymentDate: z.string(),
  amount: z.string(),
  slipNo: z.string().nullable(),
  party: z.string(),
  why: z.string(),
});

export const slipRowSchema = z.object({
  id: z.string(),
  status: z.enum(SLIP_STATUSES),
  fileName: z.string(),
  mimeType: z.string(),
  party: ref,
  paymentDate: z.string(),
  amount: z.string(),
  bank: ref.nullable(),
  slipNo: z.string().nullable(),
  depositor: z.string().nullable(),
  paymentId: z.string().nullable(),
  rejectReason: z.string().nullable(),
  uploadedBy: ref,
  reviewedBy: ref.nullable(),
  createdAt: z.string(),
});
export type SlipRow = z.infer<typeof slipRowSchema>;

export const slipListSchema = z.object({
  data: z.array(slipRowSchema),
  meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
  counts: z.record(z.string(), z.number()),
});

export const slipDetailSchema = slipRowSchema.extend({
  details: z.object({
    paymentDate: z.string(),
    partyId: z.string(),
    subPartyId: z.string().nullable(),
    slipNo: z.string().nullable(),
    bankId: z.string().nullable(),
    amount: z.string(),
    remarks: z.string().nullable(),
    depositor: z.string().nullable(),
    method: z.enum(SLIP_METHODS).nullable(),
  }),
  /** Recorded payments this slip looks like. */
  duplicates: z.array(slipDuplicateSchema),
});
export type SlipDetail = z.infer<typeof slipDetailSchema>;
