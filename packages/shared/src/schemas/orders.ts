import { z } from 'zod';
import { RATE_BASES } from '../calc/rates';
import {
  dateStringSchema,
  decimalSchema,
  idSchema,
  optionalIdSchema,
  optionalTextSchema,
  paginatedSchema,
  paginationQuerySchema,
} from './common';
import { cropYearSchema } from './rate-lists';

// Orders (docs/ORDERS_DELIVERY_SPEC.md §3). Only what the user enters: rates come from the
// current rate list on the server, and every amount is recomputed there.

/**
 * - SUBMITTED: a salesman's order waiting for the office
 * - PENDING: approved, or entered by the owner/office; waiting to be invoiced
 * - REJECTED / CANCELLED: not going ahead
 * - CLOSED: the office closed it with bags still pending (from O4: after part delivery)
 */
export const ORDER_STATUSES = ['SUBMITTED', 'PENDING', 'REJECTED', 'CANCELLED', 'CLOSED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const rateSchema = decimalSchema({
  maxDecimals: 2,
  min: 0,
  exclusiveMin: true,
  max: 999_999_999,
  message: 'Enter a rate above 0 (at most 2 decimals).',
});

export const orderLineInputSchema = z.object({
  productId: idSchema,
  cropYear: cropYearSchema,
  qtyPacks: z.coerce
    .number({ error: 'Enter the bags / cartons.' })
    .int('Enter whole bags / cartons.')
    .positive('Enter the bags / cartons.')
    .max(1_000_000, 'That is too many.'),
  /**
   * Office only: a booked rate different from the rate list. Salesmen can't send one —
   * their lines always take the current list's rate. Blank = the list rate.
   */
  rate: z.preprocess(
    (v) => (v === '' ? null : v),
    rateSchema.nullish().transform((v) => v ?? null),
  ),
});
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;

/** Prompt-payment discount per category: Rs per 40 kg (rice, pulses) or per kg (ghee, spices). */
export const orderDiscountInputSchema = z.object({
  categoryId: idSchema,
  amount: decimalSchema({
    maxDecimals: 2,
    min: 0,
    max: 1_000_000,
    message: 'Enter a discount of 0 or more (at most 2 decimals).',
  }),
});
export type OrderDiscountInput = z.infer<typeof orderDiscountInputSchema>;

/** `POST /orders`, `PUT /orders/:id`. */
export const orderInputSchema = z
  .object({
    orderDate: dateStringSchema('Enter the order date.'),
    partyId: z.string({ error: 'Select the party.' }).trim().min(1, 'Select the party.'),
    subPartyId: optionalIdSchema,
    cityId: optionalIdSchema,
    salespersonId: optionalIdSchema,
    remarks: optionalTextSchema(500),
    lines: z
      .array(orderLineInputSchema)
      .min(1, 'Add at least one product.')
      .max(200, 'An order can have at most 200 lines.'),
    discounts: z.array(orderDiscountInputSchema).max(50).default([]),
  })
  .superRefine((o, ctx) => {
    const seen = new Map<string, number>();
    o.lines.forEach((l, i) => {
      const key = `${l.productId}|${l.cropYear ?? ''}`;
      const first = seen.get(key);
      if (first !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', i, 'productId'],
          message: `This product and crop year is already on line ${first + 1}.`,
        });
      } else seen.set(key, i);
    });
    const cats = new Set<string>();
    o.discounts.forEach((d, i) => {
      if (cats.has(d.categoryId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['discounts', i, 'categoryId'],
          message: 'This category has two discounts.',
        });
      }
      cats.add(d.categoryId);
    });
  });
export type OrderInput = z.infer<typeof orderInputSchema>;

/** Reject / cancel / close. */
export const orderReasonSchema = z.object({
  reason: z
    .string({ error: 'Give a reason.' })
    .trim()
    .min(1, 'Give a reason.')
    .max(500, 'Keep the reason under 500 characters.'),
});
export type OrderReasonInput = z.infer<typeof orderReasonSchema>;

const optionalFilterId = z.string().trim().min(1).optional();

export const orderListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  partyId: optionalFilterId,
  salespersonId: optionalFilterId,
  from: dateStringSchema().optional(),
  to: dateStringSchema().optional(),
  orderNo: z.coerce.number().int().positive().optional(),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

const ref = z.object({ id: z.string(), name: z.string() });

export const orderRowSchema = z.object({
  id: z.string(),
  orderNo: z.number(),
  orderDate: z.string(),
  status: z.enum(ORDER_STATUSES),
  party: ref,
  subParty: ref.nullable(),
  city: ref.nullable(),
  salesperson: ref.nullable(),
  totalPacks: z.number(),
  totalWeightKg: z.string(),
  totalAmount: z.string(),
  lineCount: z.number(),
  createdBy: ref,
  createdAt: z.string(),
});
export type OrderRow = z.infer<typeof orderRowSchema>;
export const orderListSchema = paginatedSchema(orderRowSchema);

export const orderLineSchema = z.object({
  lineNo: z.number(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    sku: z.number(),
    category: ref,
  }),
  cropYear: z.string().nullable(),
  basis: z.enum(RATE_BASES),
  /** The current list's rate when booked; null when the office set a rate for an unlisted item. */
  listRate: z.string().nullable(),
  /** Booked rate (what the invoice will charge). */
  rate: z.string(),
  packWeightKg: z.string(),
  packPcs: z.number(),
  qtyPacks: z.number(),
  ratePerPack: z.string(),
  amount: z.string(),
  weightKg: z.string(),
  /** Bags / cartons still to invoice (= qtyPacks until invoices reduce it, phase O4). */
  pendingPacks: z.number(),
});
export type OrderLine = z.infer<typeof orderLineSchema>;

export const orderDiscountSchema = z.object({
  category: ref,
  unit: z.enum(['PER_40KG', 'PER_KG']),
  amount: z.string(),
});

export const orderDetailSchema = orderRowSchema.extend({
  remarks: z.string().nullable(),
  statusReason: z.string().nullable(),
  reviewedBy: ref.nullable(),
  reviewedAt: z.string().nullable(),
  rateList: z.object({ id: z.string(), effectiveFrom: z.string() }).nullable(),
  lines: z.array(orderLineSchema),
  discounts: z.array(orderDiscountSchema),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

export const nextOrderNoSchema = z.object({ orderNo: z.number() });
