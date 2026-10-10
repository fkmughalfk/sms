import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildLedger,
  dec,
  type LedgerQuery,
  type PartyLedger,
  type PartyPosition,
  partyPosition,
  type Position,
  type RecoveryQuery,
  type RecoveryRow,
  type RecoverySummary,
  recoveryRate,
  sum,
} from '@sms/shared';
import { fromDbDate, toDbDate } from '../common/db-date';
import { parseSort } from '../common/sorting';
import { nameContains } from '../masters/master-utils';
import { PrismaService } from '../prisma/prisma.service';

const ref = { select: { id: true, name: true } } as const;

type Row = RecoveryRow;
const str = (v: { toString(): string } | null | undefined) => v?.toString() ?? '0';

function positionView(party: { id: string; name: string }, p: Position, lastPayment: Date | null) {
  return {
    party: { id: party.id, name: party.name },
    openingBalance: p.openingBalance.toString(),
    sales: p.sales.toString(),
    invoiced: p.invoiced.toString(),
    recovered: p.recovered.toString(),
    outstanding: p.outstanding.toString(),
    recoveryRate: p.recoveryRate.toString(),
    lastPaymentDate: lastPayment ? fromDbDate(lastPayment) : null,
  };
}

/**
 * Recovery figures (spec §5.4). Always whole-party totals — they are what a payment is
 * recorded against — computed with SQL sums, never by loading invoice lines (spec §7).
 * Soft-deleted invoices and payments are excluded.
 */
@Injectable()
export class RecoveryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Live "Party Position" for the payment form (Payments F5:G8). */
  async position(partyId: string): Promise<PartyPosition> {
    const party = await this.prisma.party.findUnique({
      where: { id: partyId },
      select: { id: true, name: true, openingBalance: true },
    });
    if (!party) throw new NotFoundException('Party not found.');

    const [sales, recovered] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { partyId, deletedAt: null },
        _sum: { totalAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: { partyId, deletedAt: null },
        _sum: { amount: true },
        _max: { paymentDate: true },
      }),
    ]);
    const p = partyPosition({
      openingBalance: party.openingBalance.toString(),
      sales: str(sales._sum.totalAmount),
      recovered: str(recovered._sum.amount),
    });
    return positionView(party, p, recovered._max.paymentDate);
  }

  /** Recovery summary by party (Payments J20:N…), largest outstanding first. */
  async summary(query: RecoveryQuery): Promise<RecoverySummary> {
    const [parties, sales, payments] = await Promise.all([
      this.prisma.party.findMany({
        where: { ...nameContains(query.search), ...(query.cityId ? { cityId: query.cityId } : {}) },
        select: { id: true, name: true, openingBalance: true, isActive: true, city: ref },
      }),
      this.prisma.invoice.groupBy({
        by: ['partyId'],
        where: { deletedAt: null },
        _sum: { totalAmount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['partyId'],
        where: { deletedAt: null },
        _sum: { amount: true },
        _max: { paymentDate: true },
      }),
    ]);
    const salesBy = new Map(sales.map((s) => [s.partyId, s._sum.totalAmount]));
    const paidBy = new Map(payments.map((p) => [p.partyId, p]));

    const rows = parties
      .map((party) => {
        const paid = paidBy.get(party.id);
        const p = partyPosition({
          openingBalance: party.openingBalance.toString(),
          sales: str(salesBy.get(party.id)),
          recovered: str(paid?._sum.amount),
        });
        return {
          ...positionView(party, p, paid?._max.paymentDate ?? null),
          city: party.city,
          isActive: party.isActive,
          hasActivity: !p.invoiced.isZero() || !p.recovered.isZero(),
          outstandingDec: p.outstanding,
        };
      })
      // Active parties always; inactive ones only while they have figures.
      .filter((r) => r.isActive || r.hasActivity)
      .filter((r) => !query.outstandingOnly || r.outstandingDec.gt(0));

    // Sort in memory (one row per party), then page; totals cover every matching party.
    const { field, dir } = parseSort(query.sort, 'outstanding:desc');
    const byDecimal =
      (k: 'invoiced' | 'recovered' | 'outstanding' | 'recoveryRate') => (a: Row, b: Row) =>
        dec(a[k]).comparedTo(b[k]);
    const comparers: Record<string, (a: Row, b: Row) => number> = {
      party: (a, b) => a.party.name.localeCompare(b.party.name),
      city: (a, b) => (a.city?.name ?? '').localeCompare(b.city?.name ?? ''),
      invoiced: byDecimal('invoiced'),
      recovered: byDecimal('recovered'),
      outstanding: byDecimal('outstanding'),
      recoveryRate: byDecimal('recoveryRate'),
      // Parties that never paid sort last either way.
      lastPaymentDate: (a, b) =>
        (a.lastPaymentDate ?? (dir === 'asc' ? '9999' : '0000')).localeCompare(
          b.lastPaymentDate ?? (dir === 'asc' ? '9999' : '0000'),
        ),
    };
    const compare = comparers[field] ?? comparers.outstanding!;
    const sign = comparers[field] && dir === 'asc' ? 1 : -1;
    const sorted = [...rows].sort(
      (a, b) => sign * compare(a, b) || a.party.name.localeCompare(b.party.name),
    );
    const start = (query.page - 1) * query.pageSize;

    const invoiced = sum(rows.map((r) => r.invoiced));
    const recovered = sum(rows.map((r) => r.recovered));
    return {
      data: sorted
        .slice(start, start + query.pageSize)
        .map(({ hasActivity: _a, outstandingDec: _o, ...row }) => row),
      meta: { page: query.page, pageSize: query.pageSize, total: rows.length },
      totals: {
        parties: rows.length,
        invoiced: invoiced.toString(),
        recovered: recovered.toString(),
        outstanding: invoiced.minus(recovered).toString(),
        recoveryRate: recoveryRate(recovered, invoiced).toString(),
      },
    };
  }

  /**
   * Party ledger: invoices (debit) and payments (credit) in date order with a running
   * balance. With `from`, everything earlier (plus the opening balance) is brought forward.
   */
  async ledger(partyId: string, query: LedgerQuery): Promise<PartyLedger> {
    const party = await this.prisma.party.findUnique({
      where: { id: partyId },
      select: { id: true, name: true, phone: true, openingBalance: true, city: ref },
    });
    if (!party) throw new NotFoundException('Party not found.');

    const from = query.from ? toDbDate(query.from) : undefined;
    const to = query.to ? toDbDate(query.to) : undefined;
    const inRange = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const [invoices, payments, salesBefore, paidBefore] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { partyId, deletedAt: null, invoiceDate: inRange },
        select: {
          id: true,
          invoiceNo: true,
          invoiceDate: true,
          totalAmount: true,
          totalPacks: true,
          remarks: true,
        },
      }),
      this.prisma.payment.findMany({
        where: { partyId, deletedAt: null, paymentDate: inRange },
        select: {
          id: true,
          paymentDate: true,
          slipNo: true,
          bank: ref,
          amount: true,
          remarks: true,
          createdAt: true,
        },
      }),
      from
        ? this.prisma.invoice.aggregate({
            where: { partyId, deletedAt: null, invoiceDate: { lt: from } },
            _sum: { totalAmount: true },
          })
        : null,
      from
        ? this.prisma.payment.aggregate({
            where: { partyId, deletedAt: null, paymentDate: { lt: from } },
            _sum: { amount: true },
          })
        : null,
    ]);

    const broughtForward = dec(party.openingBalance.toString())
      .plus(str(salesBefore?._sum.totalAmount))
      .minus(str(paidBefore?._sum.amount));

    const ledger = buildLedger(broughtForward, [
      ...invoices.map((i) => ({
        date: fromDbDate(i.invoiceDate),
        type: 'INVOICE' as const,
        sortKey: String(i.invoiceNo).padStart(10, '0'),
        amount: i.totalAmount.toString(),
        refId: i.id,
        reference: `Invoice #${i.invoiceNo}`,
        description: [`${i.totalPacks} bags`, i.remarks].filter(Boolean).join(' · '),
      })),
      ...payments.map((p) => ({
        date: fromDbDate(p.paymentDate),
        type: 'PAYMENT' as const,
        sortKey: p.createdAt.toISOString(),
        amount: p.amount.toString(),
        refId: p.id,
        reference: p.slipNo ? `Slip ${p.slipNo}` : 'Payment',
        description: [p.bank?.name, p.remarks].filter(Boolean).join(' · ') || null,
      })),
    ]);

    return {
      party: { id: party.id, name: party.name, city: party.city, phone: party.phone },
      from: query.from ?? null,
      to: query.to ?? null,
      broughtForward: broughtForward.toString(),
      entries: ledger.rows.map(({ item, debit, credit, balance }) => ({
        date: item.date,
        type: item.type,
        refId: item.refId,
        reference: item.reference,
        description: item.description,
        debit: debit.toString(),
        credit: credit.toString(),
        balance: balance.toString(),
      })),
      totalDebit: ledger.totalDebit.toString(),
      totalCredit: ledger.totalCredit.toString(),
      closingBalance: ledger.closingBalance.toString(),
    };
  }
}
