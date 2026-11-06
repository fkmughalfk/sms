import { z } from 'zod';
import { COMMISSION_BASES } from '../calc/commission';
import { commissionRateSchema, dateStringSchema } from './common';

// Commission rules, recalculation and report (docs/COMMISSION_SPEC.md).

const id = z.string().trim().min(1);

/** `GET` / `PUT /commission/rules` (rates are fractions: 0.0035 = 0.35%). */
export const commissionRulesSchema = z
  .object({
    overrider: z
      .object({
        salespersonId: id,
        rates: z.array(z.object({ categoryId: id, rate: commissionRateSchema })).max(100),
      })
      .nullable(),
    shares: z
      .array(
        z
          .object({
            earnerId: id,
            matchPartySalespersonId: id.nullish().transform((v) => v ?? null),
            matchSubPartyId: id.nullish().transform((v) => v ?? null),
            rate: commissionRateSchema,
          })
          .refine((s) => s.matchPartySalespersonId || s.matchSubPartyId, {
            message: 'Choose whose parties or which sub-party the share applies to.',
          }),
      )
      .max(50),
  })
  .superRefine((r, ctx) => {
    const cats = new Set<string>();
    r.overrider?.rates.forEach((x, i) => {
      if (cats.has(x.categoryId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['overrider', 'rates', i],
          message: 'This category is listed twice.',
        });
      }
      cats.add(x.categoryId);
    });
  });
export type CommissionRules = z.infer<typeof commissionRulesSchema>;

const ref = z.object({ id: z.string(), name: z.string() });

/** `POST /commission/recalculate?dryRun=` — before / after per earner. */
export const commissionRecalcSchema = z.object({
  dryRun: z.boolean(),
  invoices: z.number(),
  lines: z.number(),
  changedLines: z.number(),
  totalBefore: z.string(),
  totalAfter: z.string(),
  earners: z.array(z.object({ salesperson: ref, before: z.string(), after: z.string() })),
});
export type CommissionRecalc = z.infer<typeof commissionRecalcSchema>;

export const commissionReportQuerySchema = z.object({
  from: dateStringSchema().optional(),
  to: dateStringSchema().optional(),
});
export type CommissionReportQuery = z.infer<typeof commissionReportQuerySchema>;

/** `GET /commission/report` — what each earner made, split by why (own sales / share / all sales). */
export const commissionReportSchema = z.object({
  rows: z.array(
    z.object({
      salesperson: ref,
      basis: z.enum(COMMISSION_BASES),
      /** Invoice line amounts the commission is on. */
      sales: z.string(),
      commission: z.string(),
      lines: z.number(),
    }),
  ),
  total: z.string(),
});
export type CommissionReport = z.infer<typeof commissionReportSchema>;
