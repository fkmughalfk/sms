import { Injectable } from '@nestjs/common';
import {
  type AuthUser,
  businessToday,
  dec,
  normalizeCropYear,
  type PendingReport,
  type PendingReportLine,
  type PendingReportQuery,
  type PendingTotals,
  pendingLine,
  sum,
} from '@sms/shared';
import { fromDbDate } from '../common/db-date';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { orderScope } from './orders.service';

const ref = { select: { id: true, name: true } } as const;
const NO_CITY = 'No city';

function totalsOf(lines: PendingReportLine[]): PendingTotals {
  return {
    pendingPacks: lines.reduce((n, l) => n + l.pendingPacks, 0),
    pendingWeightKg: sum(lines.map((l) => l.pendingWeightKg)).toString(),
    pendingAmount: sum(lines.map((l) => l.pendingAmount)).toString(),
  };
}

/**
 * "WAQAR RICE MILLS PENDING ORDERS DETAIL" (docs/ORDERS_DELIVERY_SPEC.md §7): every line
 * of a pending order with bags still to deliver, grouped by city, with the value still
 * to deliver at the booked rate.
 */
@Injectable()
export class PendingReportService {
  constructor(private readonly prisma: PrismaService) {}

  async report(user: AuthUser, q: PendingReportQuery): Promise<PendingReport> {
    const cropYear = q.cropYear ? normalizeCropYear(q.cropYear) : undefined;
    const where: Prisma.OrderLineWhereInput = {
      order: {
        AND: [
          { status: 'PENDING' },
          orderScope(user),
          q.partyId ? { partyId: q.partyId } : {},
          q.salespersonId ? { salespersonId: q.salespersonId } : {},
          q.cityId
            ? { OR: [{ cityId: q.cityId }, { cityId: null, party: { cityId: q.cityId } }] }
            : {},
        ],
      },
      ...(q.productId ? { productId: q.productId } : {}),
      ...(cropYear !== undefined ? { cropYear: cropYear ?? '' } : {}),
    };
    const [rows, max] = await Promise.all([
      this.prisma.orderLine.findMany({
        where,
        select: {
          lineNo: true,
          cropYear: true,
          basis: true,
          rate: true,
          packWeightKg: true,
          packPcs: true,
          qtyPacks: true,
          weightKg: true,
          openingDispatched: true,
          product: { select: { id: true, name: true, category: { select: { name: true } } } },
          order: {
            select: {
              id: true,
              orderNo: true,
              orderDate: true,
              party: { select: { id: true, name: true, city: { select: { name: true } } } },
              subParty: ref,
              salesperson: ref,
              city: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.order.aggregate({ _max: { orderNo: true } }),
    ]);

    const byCity = new Map<string, (PendingReportLine & { lineNo: number })[]>();
    for (const r of rows) {
      const p = pendingLine({
        basis: r.basis,
        rate: r.rate.toString(),
        packWeightKg: r.packWeightKg.toString(),
        packPcs: r.packPcs,
        qtyPacks: r.qtyPacks,
        dispatchedPacks: r.openingDispatched,
      });
      if (p.pendingPacks === 0) continue;
      const o = r.order;
      const city = o.city?.name ?? o.party.city?.name ?? NO_CITY;
      const line = {
        lineNo: r.lineNo,
        orderId: o.id,
        orderNo: o.orderNo,
        orderDate: fromDbDate(o.orderDate),
        party: { id: o.party.id, name: o.party.name },
        subParty: o.subParty,
        salesperson: o.salesperson,
        product: { id: r.product.id, name: r.product.name, category: r.product.category.name },
        packWeightKg: r.packWeightKg.toString(),
        packPcs: r.packPcs,
        cropYear: r.cropYear || null,
        qtyPacks: r.qtyPacks,
        weightKg: r.weightKg.toString(),
        basis: r.basis,
        rate: r.rate.toString(),
        dispatchedPacks: r.qtyPacks - p.pendingPacks,
        pendingPacks: p.pendingPacks,
        pendingWeightKg: p.pendingWeightKg.toString(),
        pendingAmount: p.pendingAmount.toString(),
      };
      byCity.set(city, [...(byCity.get(city) ?? []), line]);
    }

    const groups = [...byCity.entries()]
      .sort(([a], [b]) => (a === NO_CITY ? 1 : b === NO_CITY ? -1 : a.localeCompare(b)))
      .map(([city, lines]) => {
        const sorted = lines
          .sort(
            (a, b) =>
              a.orderDate.localeCompare(b.orderDate) ||
              a.orderNo - b.orderNo ||
              a.lineNo - b.lineNo,
          )
          .map(({ lineNo: _lineNo, ...l }) => l);
        return { city, lines: sorted, totals: totalsOf(sorted) };
      });
    const all = groups.flatMap((g) => g.lines);
    return {
      date: businessToday(),
      lastOrderNo: max._max.orderNo ?? null,
      groups,
      totals: all.length
        ? totalsOf(all)
        : { pendingPacks: 0, pendingWeightKg: dec(0).toString(), pendingAmount: '0' },
    };
  }
}
