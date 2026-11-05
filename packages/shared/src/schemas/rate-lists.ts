import { z } from 'zod';
import { normalizeCropYear, RATE_BASES } from '../calc/rates';
import {
  decimalSchema,
  idSchema,
  optionalTextSchema,
  paginatedSchema,
  paginationQuerySchema,
} from './common';

// Rate lists (docs/ORDERS_DELIVERY_SPEC.md §2): dated market rates that orders book from.

const LOCAL_DATE_TIME_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/;

/** `YYYY-MM-DDTHH:mm`, Asia/Karachi. */
export const localDateTimeSchema = z
  .string({ error: 'Enter the date and time the rates take effect.' })
  .trim()
  .regex(LOCAL_DATE_TIME_RE, 'Enter the date and time the rates take effect.');

/** "25-26", "2025/26" … → "2025-2026"; blank → null. */
export const cropYearSchema = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    const out = normalizeCropYear(v);
    if (out === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Enter the crop year like 2025-2026.' });
      return z.NEVER;
    }
    return out;
  });

export const rateBasisSchema = z.enum(RATE_BASES, { error: 'Choose per 40 kg or per pack.' });

const rateSchema = decimalSchema({
  maxDecimals: 2,
  min: 0,
  exclusiveMin: true,
  max: 999_999_999,
  message: 'Enter a rate above 0 (at most 2 decimals).',
});

export const rateListItemInputSchema = z
  .object({
    productId: idSchema,
    cropYear: cropYearSchema,
    basis: rateBasisSchema,
    /** Required when available; may be blank for N/A. */
    rate: z.preprocess(
      (v) => (v === '' ? null : v),
      rateSchema.nullish().transform((v) => v ?? null),
    ),
    isAvailable: z.boolean().default(true),
    note: optionalTextSchema(200),
  })
  .superRefine((item, ctx) => {
    if (item.isAvailable && item.rate === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['rate'],
        message: 'Enter a rate, or mark it N/A.',
      });
    }
  });
export type RateListItemInput = z.infer<typeof rateListItemInputSchema>;

/** `POST /rate-lists`, `PUT /rate-lists/:id` — the whole list (items are replaced). */
export const rateListInputSchema = z
  .object({
    effectiveFrom: localDateTimeSchema,
    remarks: optionalTextSchema(1000),
    items: z
      .array(rateListItemInputSchema)
      .min(1, 'Add at least one product.')
      .max(2000, 'A rate list can have at most 2,000 lines.'),
  })
  .superRefine((list, ctx) => {
    const seen = new Map<string, number>();
    list.items.forEach((item, i) => {
      const key = `${item.productId}|${item.cropYear ?? ''}`;
      const first = seen.get(key);
      if (first !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'cropYear'],
          message: `This product and crop year is already on line ${first + 1}.`,
        });
      } else {
        seen.set(key, i);
      }
    });
  });
export type RateListInput = z.infer<typeof rateListInputSchema>;

export const rateListQuerySchema = paginationQuerySchema;
export type RateListQuery = z.infer<typeof rateListQuerySchema>;

export const RATE_LIST_STATUSES = ['CURRENT', 'UPCOMING', 'PAST'] as const;
export type RateListStatus = (typeof RATE_LIST_STATUSES)[number];

export const rateListSummarySchema = z.object({
  id: z.string(),
  effectiveFrom: z.string(),
  remarks: z.string().nullable(),
  status: z.enum(RATE_LIST_STATUSES),
  itemCount: z.number(),
  availableCount: z.number(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});
export type RateListSummary = z.infer<typeof rateListSummarySchema>;
export const rateListPageSchema = paginatedSchema(rateListSummarySchema);

export const rateListProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.number(),
  packWeightKg: z.string(),
  packPcs: z.number(),
  category: z.string(),
  isActive: z.boolean(),
});
export type RateListProduct = z.infer<typeof rateListProductSchema>;

/** One line as shown and edited: the product, its rate, and the rate on the list before. */
export const rateListLineSchema = z.object({
  productId: z.string(),
  product: rateListProductSchema,
  cropYear: z.string().nullable(),
  basis: z.enum(RATE_BASES),
  rate: z.string().nullable(),
  isAvailable: z.boolean(),
  note: z.string().nullable(),
  /** Price of one pack as sold (bag, carton, spice pack), unrounded. Null when no rate. */
  packRate: z.string().nullable(),
  /** Same product + crop year on the previous list (null if absent or N/A there). */
  previousRate: z.string().nullable(),
});
export type RateListLine = z.infer<typeof rateListLineSchema>;

export const rateListDetailSchema = rateListSummarySchema.extend({
  items: z.array(rateListLineSchema),
  previous: z.object({ id: z.string(), effectiveFrom: z.string() }).nullable(),
});
export type RateListDetail = z.infer<typeof rateListDetailSchema>;

/** `GET /rate-lists/draft` — a starting point for a new list. */
export const rateListDraftSchema = z.object({
  copiedFrom: z.object({ id: z.string(), effectiveFrom: z.string() }).nullable(),
  items: z.array(rateListLineSchema),
});
export type RateListDraft = z.infer<typeof rateListDraftSchema>;

/** `POST /rate-lists/parse-excel` — lines read from the template, for review before saving. */
export const rateListUploadResultSchema = z.object({
  items: z.array(rateListLineSchema),
  problems: z.array(z.object({ row: z.number(), message: z.string() })),
});
export type RateListUploadResult = z.infer<typeof rateListUploadResultSchema>;
