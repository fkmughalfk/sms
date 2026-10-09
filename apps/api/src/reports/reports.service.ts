import { Injectable } from '@nestjs/common';
import {
  type AuthUser,
  avgPerPack,
  avgPerTon,
  businessToday,
  type Dashboard,
  dec,
  type Decimal,
  eachDay,
  eachMonth,
  fiscalYearRange,
  isScopedToOwnData,
  monthlyTarget,
  type PartySales,
  pctOfSales,
  type ProductSales,
  recoveryRate,
  remainingTarget,
  type ReportQuery,
  safeDivide,
  type SalesBreakdown,
  type SalesRow,
  sum,
  targetAchieved,
  type Trend,
  type TrendQuery,
  ZERO,
} from '@sms/shared';
import { invoiceScope, paymentScope } from '../common/data-scope';
import { fromDbDate, toDbDate } from '../common/db-date';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

type Num = { toString(): string } | null | undefined;
const d = (v: Num) => dec(v?.toString() ?? 0);

interface Bucket {
  id: string | null;
  name: string;
  packs: number;
  weightKg: Decimal;
  amount: Decimal;
  commission: Decimal;
}

interface Period {
  from: string;
  to: string;
}

/** Bucket rows → API rows with % of sales, sorted by amount (spec §5.5). */
function toSalesRows<T extends Bucket>(buckets: T[]) {
  const total = sum(buckets.map((b) => b.amount));
  const rows = [...buckets]
    .sort((a, b) => b.amount.comparedTo(a.amount) || a.name.localeCompare(b.name))
    .map((b) => ({
      ...b,
      weightKg: b.weightKg.toString(),
      amount: b.amount.toString(),
      commission: b.commission.toString(),
      pctOfSales: pctOfSales(b.amount, total).toString(),
    }));
  return {
    rows,
    totals: {
      packs: buckets.reduce((n, b) => n + b.packs, 0),
      weightKg: sum(buckets.map((b) => b.weightKg)).toString(),
      amount: total.toString(),
      commission: sum(buckets.map((b) => b.commission)).toString(),
    },
  };
}

/**
 * Dashboard & report figures (spec §5.5, §7). Everything is SQL aggregates
 * (aggregate/groupBy) — never invoice lines loaded into memory — and every query
 * applies the user's data scope.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async dashboard(user: AuthUser, query: ReportQuery): Promise<Dashboard> {
    const settings = await this.settings.get();
    const period = this.period(query, settings.fiscalYearStartMonth);
    const [sales, paid] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: this.invoiceWhere(user, period),
        _sum: { totalAmount: true, totalCommission: true, totalWeightKg: true, totalPacks: true },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: this.paymentWhere(user, period),
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const revenue = d(sales._sum.totalAmount);
    const commission = d(sales._sum.totalCommission);
    const weightKg = d(sales._sum.totalWeightKg);
    const packs = sales._sum.totalPacks ?? 0;
    const tons = weightKg.div(1000);
    const recovered = d(paid._sum.amount);
    const target = settings.annualSalesTarget;

    return {
      period,
      scoped: isScopedToOwnData(user.role),
      kpis: {
        revenue: revenue.toString(),
        commission: commission.toString(),
        commissionPct: safeDivide(commission, revenue).toString(),
        weightKg: weightKg.toString(),
        tons: tons.toString(),
        invoices: sales._count._all,
        packs,
        avgPerTon: avgPerTon(revenue, tons).toString(),
        avgPerPack: avgPerPack(revenue, packs).toString(),
      },
      target: {
        annualTarget: target,
        actual: revenue.toString(),
        achieved: targetAchieved(revenue, target).toString(),
        remaining: remainingTarget(revenue, target).toString(),
        monthlyTarget: monthlyTarget(target).toString(),
      },
      recovery: {
        recovered: recovered.toString(),
        outstanding: revenue.minus(recovered).toString(),
        recoveryRate: recoveryRate(recovered, revenue).toString(),
        payments: paid._count._all,
      },
    };
  }

  /** Sales by Category — Rice vs Pulses vs Other (Dashboard rows 20–25). */
  async byCategory(user: AuthUser, query: ReportQuery): Promise<SalesBreakdown> {
    const { period, products } = await this.productBuckets(user, query);
    const byCat = new Map<string, Bucket>();
    for (const p of products) {
      const key = p.category?.id ?? '__unmapped';
      const b = byCat.get(key) ?? {
        id: p.category?.id ?? null,
        name: p.category?.name ?? 'Unmapped',
        packs: 0,
        weightKg: ZERO,
        amount: ZERO,
        commission: ZERO,
      };
      b.packs += p.packs;
      b.weightKg = b.weightKg.plus(p.weightKg);
      b.amount = b.amount.plus(p.amount);
      b.commission = b.commission.plus(p.commission);
      byCat.set(key, b);
    }
    const { rows, totals } = toSalesRows([...byCat.values()]);
    return { period, data: rows, totals };
  }

  /** Sales by Product (Dashboard rows 46–87), with category; "Unmapped" when none. */
  async byProduct(user: AuthUser, query: ReportQuery): Promise<ProductSales> {
    const { period, products } = await this.productBuckets(user, query);
    const { rows, totals } = toSalesRows(
      products.map((p) => ({ ...p, category: p.category?.name ?? 'Unmapped' })),
    );
    return { period, data: rows, totals };
  }

  /** Sales by ASM / Salesperson (Dashboard rows 29–42). */
  async bySalesperson(user: AuthUser, query: ReportQuery): Promise<SalesBreakdown> {
    return this.invoiceBreakdown(user, query, 'salespersonId', 'Unassigned', (ids) =>
      this.prisma.salesperson.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      }),
    );
  }

  /** Sales by city (nice-to-have, spec §5.5). */
  async byCity(user: AuthUser, query: ReportQuery): Promise<SalesBreakdown> {
    return this.invoiceBreakdown(user, query, 'cityId', 'No city', (ids) =>
      this.prisma.city.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    );
  }

  /**
   * Sales and recovery by party for the period (Dashboard "Recovery by Party",
   * rows 96+): outstanding = invoiced − recovered, as the Excel Dashboard does.
   */
  async byParty(user: AuthUser, query: ReportQuery): Promise<PartySales> {
    const settings = await this.settings.get();
    const period = this.period(query, settings.fiscalYearStartMonth);
    const [sales, paid] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['partyId'],
        where: this.invoiceWhere(user, period),
        _sum: { totalAmount: true, totalCommission: true, totalWeightKg: true, totalPacks: true },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['partyId'],
        where: this.paymentWhere(user, period),
        _sum: { amount: true },
        _max: { paymentDate: true },
      }),
    ]);
    const ids = [...new Set([...sales.map((s) => s.partyId), ...paid.map((p) => p.partyId)])];
    const parties = await this.prisma.party.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const names = new Map(parties.map((p) => [p.id, p.name]));
    const salesBy = new Map(sales.map((s) => [s.partyId, s]));
    const paidBy = new Map(paid.map((p) => [p.partyId, p]));

    const buckets = ids.map((id) => {
      const s = salesBy.get(id);
      const p = paidBy.get(id);
      const amount = d(s?._sum.totalAmount);
      const recovered = d(p?._sum.amount);
      return {
        id,
        name: names.get(id) ?? 'Unknown',
        packs: s?._sum.totalPacks ?? 0,
        weightKg: d(s?._sum.totalWeightKg),
        amount,
        commission: d(s?._sum.totalCommission),
        invoices: s?._count._all ?? 0,
        recovered: recovered.toString(),
        outstanding: amount.minus(recovered).toString(),
        recoveryRate: recoveryRate(recovered, amount).toString(),
        lastPaymentDate: p?._max.paymentDate ? fromDbDate(p._max.paymentDate) : null,
      };
    });
    const { rows, totals } = toSalesRows(buckets);
    const recovered = sum(buckets.map((b) => b.recovered));
    return {
      period,
      data: rows,
      totals,
      recoveryTotals: {
        recovered: recovered.toString(),
        outstanding: dec(totals.amount).minus(recovered).toString(),
      },
    };
  }

  /** Daily or monthly sales, zero-filled across the period. */
  async trend(user: AuthUser, query: TrendQuery): Promise<Trend> {
    const settings = await this.settings.get();
    const period = this.period(query, settings.fiscalYearStartMonth);
    const days = await this.prisma.invoice.groupBy({
      by: ['invoiceDate'],
      where: this.invoiceWhere(user, period),
      _sum: { totalAmount: true, totalCommission: true, totalWeightKg: true, totalPacks: true },
      _count: { _all: true },
    });

    const keyOf = (date: string) => (query.granularity === 'month' ? date.slice(0, 7) : date);
    const keys =
      query.granularity === 'month'
        ? eachMonth(period.from, period.to)
        : eachDay(period.from, period.to);
    const points = new Map(
      keys.map((k) => [
        k,
        { amount: ZERO, commission: ZERO, weightKg: ZERO, packs: 0, invoices: 0 },
      ]),
    );
    for (const row of days) {
      const p = points.get(keyOf(fromDbDate(row.invoiceDate)));
      if (!p) continue;
      p.amount = p.amount.plus(d(row._sum.totalAmount));
      p.commission = p.commission.plus(d(row._sum.totalCommission));
      p.weightKg = p.weightKg.plus(d(row._sum.totalWeightKg));
      p.packs += row._sum.totalPacks ?? 0;
      p.invoices += row._count._all;
    }

    return {
      period,
      granularity: query.granularity,
      points: [...points].map(([key, p]) => ({
        period: key,
        amount: p.amount.toString(),
        commission: p.commission.toString(),
        weightKg: p.weightKg.toString(),
        packs: p.packs,
        invoices: p.invoices,
      })),
      monthlyTarget: monthlyTarget(settings.annualSalesTarget).toString(),
    };
  }

  // ── Internals ──

  /** `from`/`to`, defaulting to the current fiscal year (spec §5.5). */
  private period(query: ReportQuery, fiscalYearStartMonth: number): Period {
    const fy = fiscalYearRange(businessToday(), fiscalYearStartMonth);
    return { from: query.from ?? fy.from, to: query.to ?? fy.to };
  }

  private invoiceWhere(user: AuthUser, period: Period): Prisma.InvoiceWhereInput {
    return {
      deletedAt: null,
      ...invoiceScope(user),
      invoiceDate: { gte: toDbDate(period.from), lte: toDbDate(period.to) },
    };
  }

  private paymentWhere(user: AuthUser, period: Period): Prisma.PaymentWhereInput {
    return {
      deletedAt: null,
      ...paymentScope(user),
      paymentDate: { gte: toDbDate(period.from), lte: toDbDate(period.to) },
    };
  }

  /** Per-product sums from invoice lines (SQL group-by), with each product's category. */
  private async productBuckets(user: AuthUser, query: ReportQuery) {
    const settings = await this.settings.get();
    const period = this.period(query, settings.fiscalYearStartMonth);
    const groups = await this.prisma.invoiceLine.groupBy({
      by: ['productId'],
      where: { invoice: this.invoiceWhere(user, period) },
      _sum: { qtyPacks: true, weightKg: true, amount: true, commission: true },
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: groups.map((g) => g.productId) } },
      select: { id: true, name: true, sku: true, category: { select: { id: true, name: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      period,
      products: groups.map((g) => {
        const p = byId.get(g.productId);
        return {
          id: g.productId,
          name: p?.name ?? 'Unknown product',
          sku: p?.sku ?? null,
          category: p?.category ?? null,
          packs: g._sum.qtyPacks ?? 0,
          weightKg: d(g._sum.weightKg),
          amount: d(g._sum.amount),
          commission: d(g._sum.commission),
        };
      }),
    };
  }

  /** Breakdown over a nullable invoice foreign key (salesperson, city). */
  private async invoiceBreakdown(
    user: AuthUser,
    query: ReportQuery,
    key: 'salespersonId' | 'cityId',
    emptyLabel: string,
    lookup: (ids: string[]) => Promise<{ id: string; name: string }[]>,
  ): Promise<SalesBreakdown> {
    const settings = await this.settings.get();
    const period = this.period(query, settings.fiscalYearStartMonth);
    const groups = await this.prisma.invoice.groupBy({
      by: [key],
      where: this.invoiceWhere(user, period),
      _sum: { totalAmount: true, totalCommission: true, totalWeightKg: true, totalPacks: true },
    });
    const ids = groups.map((g) => g[key]).filter((id): id is string => id !== null);
    const names = new Map((await lookup(ids)).map((r) => [r.id, r.name]));
    const { rows, totals } = toSalesRows(
      groups.map((g): Bucket => ({
        id: g[key],
        name: g[key] ? (names.get(g[key]) ?? 'Unknown') : emptyLabel,
        packs: g._sum.totalPacks ?? 0,
        weightKg: d(g._sum.totalWeightKg),
        amount: d(g._sum.totalAmount),
        commission: d(g._sum.totalCommission),
      })),
    );
    return { period, data: rows as SalesRow[], totals };
  }
}
