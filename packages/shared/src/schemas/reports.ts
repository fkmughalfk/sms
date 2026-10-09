import { z } from 'zod';
import { dateStringSchema } from './common';

// Dashboard & reports (spec §5.5, §7). Decimals are strings; dates YYYY-MM-DD.

/** `?from&to` — defaults to the current fiscal year (Asia/Karachi) when omitted. */
export const reportQuerySchema = z.object({
  from: dateStringSchema().optional(),
  to: dateStringSchema().optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const trendQuerySchema = reportQuerySchema.extend({
  granularity: z.enum(['day', 'month']).default('month'),
});
export type TrendQuery = z.infer<typeof trendQuerySchema>;

const periodSchema = z.object({ from: z.string(), to: z.string() });

/** `GET /reports/dashboard` — KPI cards, annual target, recovery totals in one call. */
export const dashboardSchema = z.object({
  period: periodSchema,
  /** USER sees only their own data (spec §3 note **). */
  scoped: z.boolean(),
  kpis: z.object({
    revenue: z.string(),
    commission: z.string(),
    /** commission ÷ revenue — "▲ x.xx% of sales". */
    commissionPct: z.string(),
    weightKg: z.string(),
    tons: z.string(),
    invoices: z.number(),
    packs: z.number(),
    avgPerTon: z.string(),
    avgPerPack: z.string(),
  }),
  target: z.object({
    annualTarget: z.string(),
    actual: z.string(),
    /** actual ÷ target (0–1+). */
    achieved: z.string(),
    remaining: z.string(),
    monthlyTarget: z.string(),
  }),
  recovery: z.object({
    recovered: z.string(),
    /** revenue − recovered (period figures, as on the Excel Dashboard). */
    outstanding: z.string(),
    /** recovered ÷ revenue. */
    recoveryRate: z.string(),
    payments: z.number(),
  }),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

/** One row of a "Sales by …" table: Qty, Weight, Amount, Commission, % of Sales. */
export const salesRowSchema = z.object({
  /** null for "Unassigned" / "No city" / "Unmapped" buckets. */
  id: z.string().nullable(),
  name: z.string(),
  packs: z.number(),
  weightKg: z.string(),
  amount: z.string(),
  commission: z.string(),
  pctOfSales: z.string(),
});
export type SalesRow = z.infer<typeof salesRowSchema>;

const salesTotalsSchema = z.object({
  packs: z.number(),
  weightKg: z.string(),
  amount: z.string(),
  commission: z.string(),
});

export const salesBreakdownSchema = z.object({
  period: periodSchema,
  data: z.array(salesRowSchema),
  totals: salesTotalsSchema,
});
export type SalesBreakdown = z.infer<typeof salesBreakdownSchema>;

/** Sales by product adds the category. */
export const productSalesRowSchema = salesRowSchema.extend({
  sku: z.number().nullable(),
  category: z.string(),
});
export const productSalesSchema = salesBreakdownSchema.extend({
  data: z.array(productSalesRowSchema),
});
export type ProductSales = z.infer<typeof productSalesSchema>;

/** Sales + recovery by party (Dashboard "Recovery by Party", rows 96+; top parties). */
export const partySalesRowSchema = salesRowSchema.extend({
  invoices: z.number(),
  recovered: z.string(),
  outstanding: z.string(),
  recoveryRate: z.string(),
  lastPaymentDate: z.string().nullable(),
});
export const partySalesSchema = salesBreakdownSchema.extend({
  data: z.array(partySalesRowSchema),
  recoveryTotals: z.object({ recovered: z.string(), outstanding: z.string() }),
});
export type PartySales = z.infer<typeof partySalesSchema>;

export const trendPointSchema = z.object({
  /** `YYYY-MM` or `YYYY-MM-DD`. */
  period: z.string(),
  amount: z.string(),
  commission: z.string(),
  packs: z.number(),
  weightKg: z.string(),
  invoices: z.number(),
});
export type TrendPoint = z.infer<typeof trendPointSchema>;

export const trendSchema = z.object({
  period: periodSchema,
  granularity: z.enum(['day', 'month']),
  /** Every day/month in the period, zero-filled. */
  points: z.array(trendPointSchema),
  /** Annual target ÷ 12, for the monthly actual-vs-target chart. */
  monthlyTarget: z.string(),
});
export type Trend = z.infer<typeof trendSchema>;
