import { z } from 'zod';
import {
  booleanQuerySchema,
  dateStringSchema,
  decimalSchema,
  monthStringSchema,
  optionalIdSchema,
  optionalTextSchema,
  paginatedSchema,
  paginationQuerySchema,
} from './common';

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

// ── List filters ──

const optionalFilterId = z.string().trim().min(1).optional();

/** Filters shared by `GET /payments` and `GET /payments/export`. */
export const paymentFilterSchema = z.object({
  month: monthStringSchema.optional(),
  from: dateStringSchema().optional(),
  to: dateStringSchema().optional(),
  partyId: optionalFilterId,
  bankId: optionalFilterId,
  /** Matches slip no. or remarks. */
  search: z.string().trim().min(1).optional(),
});
export type PaymentFilter = z.infer<typeof paymentFilterSchema>;

export const paymentListQuerySchema = paginationQuerySchema.extend(paymentFilterSchema.shape);
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

// ── Responses (decimals are strings, dates YYYY-MM-DD) ──

const ref = z.object({ id: z.string(), name: z.string() });

export const paymentRowSchema = z.object({
  id: z.string(),
  paymentDate: z.string(),
  party: ref,
  subParty: ref.nullable(),
  slipNo: z.string().nullable(),
  bank: ref.nullable(),
  amount: z.string(),
  remarks: z.string().nullable(),
  createdBy: ref,
  createdAt: z.string(),
});
export type PaymentRow = z.infer<typeof paymentRowSchema>;

export const paymentTotalsSchema = z.object({ payments: z.number(), totalAmount: z.string() });
export type PaymentTotals = z.infer<typeof paymentTotalsSchema>;

export const paymentListSchema = paginatedSchema(paymentRowSchema).extend({
  totals: paymentTotalsSchema,
});
export type PaymentList = z.infer<typeof paymentListSchema>;

/** Live "Party Position" (Payments F5:G8). */
export const partyPositionSchema = z.object({
  party: ref,
  openingBalance: z.string(),
  /** Σ invoice totals. */
  sales: z.string(),
  /** openingBalance + sales. */
  invoiced: z.string(),
  recovered: z.string(),
  /** invoiced − recovered (negative = paid in advance). */
  outstanding: z.string(),
  /** recovered ÷ invoiced (0–1+). */
  recoveryRate: z.string(),
  lastPaymentDate: z.string().nullable(),
});
export type PartyPosition = z.infer<typeof partyPositionSchema>;

/** Recovery summary by party (Payments J20:N…). */
export const recoveryRowSchema = partyPositionSchema.extend({
  city: ref.nullable(),
  isActive: z.boolean(),
});
export type RecoveryRow = z.infer<typeof recoveryRowSchema>;

export const recoverySummarySchema = z.object({
  data: z.array(recoveryRowSchema),
  totals: z.object({
    parties: z.number(),
    invoiced: z.string(),
    recovered: z.string(),
    outstanding: z.string(),
    recoveryRate: z.string(),
  }),
});
export type RecoverySummary = z.infer<typeof recoverySummarySchema>;

export const recoveryQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  cityId: optionalFilterId,
  /** Only parties that still owe money. */
  outstandingOnly: booleanQuerySchema.optional(),
});
export type RecoveryQuery = z.infer<typeof recoveryQuerySchema>;

export const ledgerQuerySchema = z.object({
  from: dateStringSchema().optional(),
  to: dateStringSchema().optional(),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

export const ledgerEntrySchema = z.object({
  date: z.string(),
  type: z.enum(['INVOICE', 'PAYMENT']),
  /** Invoice or payment id, for linking. */
  refId: z.string(),
  /** "Invoice #15" / "Slip 4411". */
  reference: z.string(),
  description: z.string().nullable(),
  debit: z.string(),
  credit: z.string(),
  balance: z.string(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

/** Party ledger: chronological debits (invoices) and credits (payments) with a running balance. */
export const partyLedgerSchema = z.object({
  party: ref.extend({ city: ref.nullable(), phone: z.string().nullable() }),
  from: z.string().nullable(),
  to: z.string().nullable(),
  /** Opening balance + everything before `from`. */
  broughtForward: z.string(),
  entries: z.array(ledgerEntrySchema),
  totalDebit: z.string(),
  totalCredit: z.string(),
  closingBalance: z.string(),
});
export type PartyLedger = z.infer<typeof partyLedgerSchema>;
