import { z } from 'zod';

// Invoice PDFs (docs/ORDERS_DELIVERY_SPEC.md §4, phase O4): read → check → post, or wait
// in "Needs review" until the office decides what the system couldn't.

export const PDF_IMPORT_STATUSES = ['POSTED', 'NEEDS_REVIEW', 'DUPLICATE', 'FAILED'] as const;
export type PdfImportStatus = (typeof PDF_IMPORT_STATUSES)[number];

const ref = z.object({ id: z.string(), name: z.string() });

/** The office's decisions for one PDF. Every field is optional; blanks mean "let the system match". */
export const pdfResolutionSchema = z.object({
  partyId: z.string().trim().min(1).nullish(),
  subPartyId: z.string().trim().min(1).nullish(),
  salespersonId: z.string().trim().min(1).nullish(),
  /** Deliver against this order (instead of matching by product, crop year and rate). */
  orderId: z.string().trim().min(1).nullish(),
  /** Per line (by Sr. No.): the product, and whether bags with no pending order may post. */
  lines: z
    .record(
      z.string(),
      z.object({
        productId: z.string().trim().min(1).nullish(),
        allowWithoutOrder: z.boolean().optional(),
      }),
    )
    .default({}),
});
export type PdfResolution = z.infer<typeof pdfResolutionSchema>;

/** `POST /invoice-pdfs/:id/resolve` — save the decisions; post when `post` and everything checks. */
export const pdfResolveInputSchema = z.object({
  resolution: pdfResolutionSchema,
  post: z.boolean().default(false),
});
export type PdfResolveInput = z.infer<typeof pdfResolveInputSchema>;

export const pdfImportQuerySchema = z.object({
  status: z.enum(PDF_IMPORT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PdfImportQuery = z.infer<typeof pdfImportQuerySchema>;

export const pdfImportRowSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  status: z.enum(PDF_IMPORT_STATUSES),
  invoiceNo: z.number().nullable(),
  invoiceDate: z.string().nullable(),
  party: z.string(),
  amount: z.string(),
  problems: z.array(z.string()),
  invoiceId: z.string().nullable(),
  uploadedBy: z.string().nullable(),
  createdAt: z.string(),
});
export type PdfImportRow = z.infer<typeof pdfImportRowSchema>;
export const pdfImportListSchema = z.object({
  data: z.array(pdfImportRowSchema),
  meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
  counts: z.record(z.string(), z.number()),
});

const allocationSchema = z.object({
  orderId: z.string(),
  orderNo: z.number(),
  orderDate: z.string(),
  qtyPacks: z.number(),
  isOpening: z.boolean(),
});

/** One PDF line as read, what it matched and where its bags go. */
export const pdfLinePlanSchema = z.object({
  srNo: z.number(),
  description: z.string(),
  cropYear: z.string().nullable(),
  qty: z.number(),
  rate40Kg: z.string(),
  bagRate: z.string(),
  weight: z.string(),
  amount: z.string(),
  product: ref.nullable(),
  productSuggestion: ref.nullable(),
  basis: z.enum(['PER_40KG', 'PER_UNIT']).nullable(),
  /** The system's own amount for the line (half rupee down). */
  computedAmount: z.string().nullable(),
  allocations: z.array(allocationSchema),
  /** Bags that found no pending order. */
  unallocated: z.number(),
  allowWithoutOrder: z.boolean(),
  problems: z.array(z.string()),
});
export type PdfLinePlan = z.infer<typeof pdfLinePlanSchema>;

export const pdfImportDetailSchema = pdfImportRowSchema.extend({
  header: z.object({
    party: z.string(),
    subParty: z.string(),
    city: z.string(),
    doNo: z.string(),
    vehicleNo: z.string(),
    dcNo: z.string(),
    ogpNo: z.string(),
    orderNo: z.number().nullable(),
  }),
  matched: z.object({
    party: ref.nullable(),
    partySuggestion: ref.nullable(),
    city: ref.nullable(),
    salesperson: ref.nullable(),
    subParty: ref.nullable(),
    order: z.object({ id: z.string(), orderNo: z.number() }).nullable(),
  }),
  /** Invoices up to this date don't reduce opening orders (Settings). */
  goLiveDate: z.string().nullable(),
  lines: z.array(pdfLinePlanSchema),
  totals: z.object({ qty: z.string(), weight: z.string(), amount: z.string() }),
  resolution: z.unknown(),
  /** True when it would post as it stands. */
  ready: z.boolean(),
});
export type PdfImportDetail = z.infer<typeof pdfImportDetailSchema>;
