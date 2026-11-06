import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type AuthUser,
  type CommissionBasis,
  type CommissionConfig,
  type CommissionRecalc,
  type CommissionReport,
  type CommissionReportQuery,
  type CommissionRules,
  type CommissionShareRow,
  commissionTotalRate,
  dec,
  resolveCommissionRate,
  splitCommission,
  sum,
} from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import { toDbDate } from '../common/db-date';
import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../masters/master.service';
import { PrismaService } from '../prisma/prisma.service';

/** What a line needs to know to split its commission. */
export interface LineContext {
  amount: string;
  totalRate: string;
  partySalespersonId: string | null;
  subPartyId: string | null;
  invoiceSalespersonId: string | null;
}

/**
 * Salesman commission (docs/COMMISSION_SPEC.md): rules, the per-line split used whenever an
 * invoice is saved, a dry-run-then-apply recalculation of every invoice, and the report.
 */
@Injectable()
export class CommissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async config(db: Db = this.prisma): Promise<CommissionConfig> {
    const [overrider, shares] = await Promise.all([
      db.salesperson.findFirst({
        where: { earnsOnAllSales: true },
        select: { id: true, commissionRates: { select: { categoryId: true, rate: true } } },
      }),
      db.commissionShare.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    return {
      overrider: overrider
        ? {
            salespersonId: overrider.id,
            rates: Object.fromEntries(
              overrider.commissionRates.map((r) => [r.categoryId, r.rate.toString()]),
            ),
          }
        : null,
      shares: shares.map((s) => ({
        earnerId: s.earnerId,
        matchPartySalespersonId: s.matchPartySalespersonId,
        matchSubPartyId: s.matchSubPartyId,
        rate: s.rate.toString(),
      })),
    };
  }

  /** Rows to store with a line (who earns what). */
  rows(config: CommissionConfig, l: LineContext) {
    return splitCommission({ ...l, config }).map((r) => this.rowData(r));
  }

  private rowData(r: CommissionShareRow) {
    return {
      salespersonId: r.salespersonId,
      basis: r.basis,
      rate: r.rate.toString(),
      amount: r.amount.toString(),
    };
  }

  async getRules(db: Db = this.prisma): Promise<CommissionRules> {
    const c = await this.config(db);
    return {
      overrider: c.overrider
        ? {
            salespersonId: c.overrider.salespersonId,
            rates: Object.entries(c.overrider.rates).map(([categoryId, rate]) => ({
              categoryId,
              rate: dec(rate).toString(),
            })),
          }
        : null,
      shares: c.shares.map((s) => ({ ...s, rate: dec(s.rate).toString() })),
    };
  }

  /** Replaces the rules. Saved invoices keep their commission until recalculated. */
  async putRules(
    user: AuthUser,
    rules: CommissionRules,
    ip: string | null,
  ): Promise<CommissionRules> {
    await this.prisma.$transaction(async (tx) => {
      const ids = [
        rules.overrider?.salespersonId,
        ...rules.shares.flatMap((s) => [s.earnerId, s.matchPartySalespersonId]),
      ].filter((x): x is string => !!x);
      const found = await tx.salesperson.count({ where: { id: { in: [...new Set(ids)] } } });
      if (found !== new Set(ids).size)
        throw new BadRequestException('A salesman in the rules was not found.');
      const before = await this.getRules(tx);
      await tx.salesperson.updateMany({
        where: { earnsOnAllSales: true },
        data: { earnsOnAllSales: false },
      });
      await tx.salespersonCommissionRate.deleteMany({});
      await tx.commissionShare.deleteMany({});
      if (rules.overrider) {
        await tx.salesperson.update({
          where: { id: rules.overrider.salespersonId },
          data: { earnsOnAllSales: true },
        });
        await tx.salespersonCommissionRate.createMany({
          data: rules.overrider.rates.map((r) => ({
            salespersonId: rules.overrider!.salespersonId,
            categoryId: r.categoryId,
            rate: r.rate,
          })),
        });
      }
      await tx.commissionShare.createMany({
        data: rules.shares.map((s, i) => ({ ...s, sortOrder: i })),
      });
      await this.audit.log(
        { userId: user.id, action: 'UPDATE', entity: 'CommissionRules', before, after: rules, ip },
        tx,
      );
    });
    return this.getRules();
  }

  /**
   * Re-applies today's rules to every invoice line: the total rate (overriding salesman's
   * category rate, else product → category → default) and the split. Amounts never change.
   * A dry run only reports what would change.
   */
  async recalculate(user: AuthUser, dryRun: boolean, ip: string | null): Promise<CommissionRecalc> {
    const run = async (tx: Prisma.TransactionClient): Promise<CommissionRecalc> => {
      const [config, setting, lines] = await Promise.all([
        this.config(tx),
        tx.setting.findUnique({ where: { id: 1 }, select: { defaultCommissionRate: true } }),
        tx.invoiceLine.findMany({
          where: { invoice: { deletedAt: null } },
          select: {
            id: true,
            invoiceId: true,
            amount: true,
            commissionRate: true,
            commission: true,
            commissions: { select: { salespersonId: true, amount: true } },
            product: {
              select: {
                categoryId: true,
                commissionRate: true,
                category: { select: { commissionRate: true } },
              },
            },
            invoice: {
              select: {
                salespersonId: true,
                subPartyId: true,
                party: { select: { salespersonId: true } },
              },
            },
          },
        }),
      ]);
      const defaultRate = setting?.defaultCommissionRate.toString() ?? '0.0035';
      const add = (m: Map<string, string[]>, k: string, v: string) =>
        m.set(k, [...(m.get(k) ?? []), v]);
      const beforeBy = new Map<string, string[]>();
      const afterBy = new Map<string, string[]>();
      const invoiceTotals = new Map<string, string[]>();
      let changed = 0;
      const updates: {
        id: string;
        rate: string;
        commission: string;
        rows: ReturnType<CommissionService['rows']>;
      }[] = [];

      for (const l of lines) {
        // Before: stored rows, or (older invoices) the whole commission to the invoice salesman.
        if (l.commissions.length) {
          for (const r of l.commissions) add(beforeBy, r.salespersonId, r.amount.toString());
        } else if (l.invoice.salespersonId) {
          add(beforeBy, l.invoice.salespersonId, l.commission.toString());
        }
        const rate = commissionTotalRate(
          config,
          l.product.categoryId,
          resolveCommissionRate(
            l.product.commissionRate?.toString(),
            l.product.category.commissionRate?.toString(),
            defaultRate,
          ),
        );
        const commission = dec(l.amount.toString()).times(rate).toDecimalPlaces(4);
        const rows = this.rows(config, {
          amount: l.amount.toString(),
          totalRate: rate.toString(),
          partySalespersonId: l.invoice.party.salespersonId,
          subPartyId: l.invoice.subPartyId,
          invoiceSalespersonId: l.invoice.salespersonId,
        });
        for (const r of rows) add(afterBy, r.salespersonId, r.amount);
        add(invoiceTotals, l.invoiceId, commission.toString());
        const sameRows =
          rows.length === l.commissions.length &&
          rows.every((r) =>
            l.commissions.some(
              (c) => c.salespersonId === r.salespersonId && dec(c.amount.toString()).eq(r.amount),
            ),
          );
        if (
          !rate.eq(l.commissionRate.toString()) ||
          !commission.eq(l.commission.toString()) ||
          !sameRows
        ) {
          changed++;
          updates.push({
            id: l.id,
            rate: rate.toString(),
            commission: commission.toString(),
            rows,
          });
        }
      }

      const ids = [...new Set([...beforeBy.keys(), ...afterBy.keys()])];
      const people = await tx.salesperson.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      const name = new Map(people.map((p) => [p.id, p.name]));
      const total = (m: Map<string, string[]>) => sum([...m.values()].flat());
      const report: CommissionRecalc = {
        dryRun,
        invoices: new Set(lines.map((l) => l.invoiceId)).size,
        lines: lines.length,
        changedLines: changed,
        totalBefore: total(beforeBy).toString(),
        totalAfter: total(afterBy).toString(),
        earners: ids
          .map((id) => ({
            salesperson: { id, name: name.get(id) ?? 'Unknown' },
            before: sum(beforeBy.get(id) ?? []).toString(),
            after: sum(afterBy.get(id) ?? []).toString(),
          }))
          .sort((a, b) => dec(b.after).comparedTo(a.after)),
      };
      if (dryRun) return report;

      for (const u of updates) {
        await tx.invoiceLineCommission.deleteMany({ where: { invoiceLineId: u.id } });
        await tx.invoiceLine.update({
          where: { id: u.id },
          data: {
            commissionRate: u.rate,
            commission: u.commission,
            commissions: { create: u.rows },
          },
        });
      }
      for (const [invoiceId, parts] of invoiceTotals) {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { totalCommission: sum(parts).toString() },
        });
      }
      await this.audit.log(
        {
          userId: user.id,
          action: 'UPDATE',
          entity: 'CommissionRules',
          entityId: 'recalculate',
          before: { total: report.totalBefore },
          after: { total: report.totalAfter, changedLines: changed, earners: report.earners },
          ip,
        },
        tx,
      );
      return report;
    };
    return dryRun
      ? this.prisma.$transaction(run)
      : this.prisma.$transaction(run, { timeout: 300_000, maxWait: 10_000 });
  }

  /** What each earner made in the period, by why (all sales / share / own sales). */
  async report(q: CommissionReportQuery): Promise<CommissionReport> {
    const invoiceDate = {
      ...(q.from ? { gte: toDbDate(q.from) } : {}),
      ...(q.to ? { lte: toDbDate(q.to) } : {}),
    };
    const rows = await this.prisma.invoiceLineCommission.findMany({
      where: { invoiceLine: { invoice: { deletedAt: null, invoiceDate } } },
      select: {
        basis: true,
        amount: true,
        salesperson: { select: { id: true, name: true } },
        invoiceLine: { select: { amount: true } },
      },
    });
    const groups = new Map<
      string,
      {
        salesperson: { id: string; name: string };
        basis: CommissionBasis;
        sales: string[];
        commission: string[];
      }
    >();
    for (const r of rows) {
      const k = `${r.salesperson.id}|${r.basis}`;
      const g = groups.get(k) ?? {
        salesperson: r.salesperson,
        basis: r.basis,
        sales: [],
        commission: [],
      };
      g.sales.push(r.invoiceLine.amount.toString());
      g.commission.push(r.amount.toString());
      groups.set(k, g);
    }
    const out = [...groups.values()]
      .map((g) => ({
        salesperson: g.salesperson,
        basis: g.basis,
        sales: sum(g.sales).toString(),
        commission: sum(g.commission).toString(),
        lines: g.commission.length,
      }))
      .sort((a, b) => dec(b.commission).comparedTo(a.commission));
    return { rows: out, total: sum(out.map((r) => r.commission)).toString() };
  }
}
