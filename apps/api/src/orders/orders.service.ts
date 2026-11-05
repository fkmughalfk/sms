import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AuthUser,
  calcOrderLine,
  calcOrderTotals,
  defaultRateBasis,
  discountUnit,
  hasPermission,
  isScopedToOwnData,
  type OrderDetail,
  type OrderInput,
  type OrderListQuery,
  type OrderRow,
  type OrderStatus,
  packWeightKg,
  type Paginated,
  type RateBasis,
  toBusinessDateTime,
} from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import { fromDbDate, toDbDate } from '../common/db-date';
import { Prisma } from '../generated/prisma/client';
import type { Db } from '../masters/master.service';
import { toPage } from '../masters/master-utils';
import { PrismaService } from '../prisma/prisma.service';

const ref = { select: { id: true, name: true } } as const;

const rowSelect = {
  id: true,
  orderNo: true,
  orderDate: true,
  status: true,
  party: ref,
  subParty: ref,
  city: ref,
  salesperson: ref,
  totalPacks: true,
  totalWeightKg: true,
  totalAmount: true,
  createdById: true,
  createdAt: true,
  _count: { select: { lines: true } },
} as const;
type RowRec = Prisma.OrderGetPayload<{ select: typeof rowSelect }>;

const detailSelect = {
  ...rowSelect,
  remarks: true,
  statusReason: true,
  reviewedById: true,
  reviewedAt: true,
  rateList: { select: { id: true, effectiveFrom: true } },
  lines: {
    orderBy: { lineNo: 'asc' },
    select: {
      lineNo: true,
      product: { select: { id: true, name: true, sku: true, category: ref } },
      cropYear: true,
      basis: true,
      listRate: true,
      rate: true,
      packWeightKg: true,
      packPcs: true,
      qtyPacks: true,
      ratePerPack: true,
      amount: true,
      weightKg: true,
    },
  },
  discounts: { select: { category: ref, amount: true } },
} as const;
type DetailRec = Prisma.OrderGetPayload<{ select: typeof detailSelect }>;

/** A line ready to save: booked rate, snapshots and calculated values. */
interface BookedLine {
  lineNo: number;
  productId: string;
  cropYear: string;
  basis: RateBasis;
  listRate: string | null;
  rate: string;
  packWeightKg: string;
  packPcs: number;
  qtyPacks: number;
  ratePerPack: string;
  amount: string;
  weightKg: string;
}

const lineKey = (productId: string, cropYear: string | null) => `${productId}|${cropYear ?? ''}`;

/** Orders a user may see: ADMIN+ all; a USER their own, plus their salesperson's. */
export function orderScope(user: AuthUser): Prisma.OrderWhereInput {
  if (!isScopedToOwnData(user.role)) return {};
  return user.salespersonId
    ? { OR: [{ createdById: user.id }, { salespersonId: user.salespersonId }] }
    : { createdById: user.id };
}

/**
 * Orders (docs/ORDERS_DELIVERY_SPEC.md §3). Rates come from the rate list in force when
 * the order is booked and then stay (booked rate). Every write is one transaction with
 * an audit entry; amounts are always recomputed here.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Reads ──

  private async names(ids: (string | null)[], db: Db = this.prisma) {
    const users = await db.user.findMany({
      where: { id: { in: [...new Set(ids.filter((i): i is string => !!i))] } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private toRow(r: RowRec, names: Map<string, string>): OrderRow {
    return {
      id: r.id,
      orderNo: r.orderNo,
      orderDate: fromDbDate(r.orderDate),
      status: r.status,
      party: r.party,
      subParty: r.subParty,
      city: r.city,
      salesperson: r.salesperson,
      totalPacks: r.totalPacks,
      totalWeightKg: r.totalWeightKg.toString(),
      totalAmount: r.totalAmount.toString(),
      lineCount: r._count.lines,
      createdBy: { id: r.createdById, name: names.get(r.createdById) ?? 'Unknown' },
      createdAt: r.createdAt.toISOString(),
    };
  }

  async list(user: AuthUser, query: OrderListQuery): Promise<Paginated<OrderRow>> {
    const where: Prisma.OrderWhereInput = {
      AND: [
        orderScope(user),
        {
          ...(query.status ? { status: query.status } : {}),
          ...(query.partyId ? { partyId: query.partyId } : {}),
          ...(query.salespersonId ? { salespersonId: query.salespersonId } : {}),
          ...(query.orderNo ? { orderNo: query.orderNo } : {}),
          ...(query.from || query.to
            ? {
                orderDate: {
                  ...(query.from ? { gte: toDbDate(query.from) } : {}),
                  ...(query.to ? { lte: toDbDate(query.to) } : {}),
                },
              }
            : {}),
        },
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        select: rowSelect,
        orderBy: [{ orderDate: 'desc' }, { orderNo: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const names = await this.names(rows.map((r) => r.createdById));
    return toPage(
      rows.map((r) => this.toRow(r, names)),
      total,
      query,
    );
  }

  async get(user: AuthUser, id: string, db: Db = this.prisma): Promise<OrderDetail> {
    const o = await db.order.findFirst({
      where: { AND: [{ id }, orderScope(user)] },
      select: detailSelect,
    });
    if (!o) throw new NotFoundException('Order not found.');
    return this.toDetail(o, db);
  }

  private async toDetail(o: DetailRec, db: Db): Promise<OrderDetail> {
    const names = await this.names([o.createdById, o.reviewedById], db);
    return {
      ...this.toRow(o, names),
      remarks: o.remarks,
      statusReason: o.statusReason,
      reviewedBy: o.reviewedById
        ? { id: o.reviewedById, name: names.get(o.reviewedById) ?? 'Unknown' }
        : null,
      reviewedAt: o.reviewedAt?.toISOString() ?? null,
      rateList: o.rateList
        ? { id: o.rateList.id, effectiveFrom: toBusinessDateTime(o.rateList.effectiveFrom) }
        : null,
      lines: o.lines.map((l) => ({
        lineNo: l.lineNo,
        product: l.product,
        cropYear: l.cropYear || null,
        basis: l.basis,
        listRate: l.listRate?.toString() ?? null,
        rate: l.rate.toString(),
        packWeightKg: l.packWeightKg.toString(),
        packPcs: l.packPcs,
        qtyPacks: l.qtyPacks,
        ratePerPack: l.ratePerPack.toString(),
        amount: l.amount.toString(),
        weightKg: l.weightKg.toString(),
        // Invoices reduce this from phase O4.
        pendingPacks: l.qtyPacks,
      })),
      discounts: o.discounts
        .map((d) => ({
          category: d.category,
          unit: discountUnit(d.category.name),
          amount: d.amount.toString(),
        }))
        .sort((a, b) => a.category.name.localeCompare(b.category.name)),
    };
  }

  /** Next order number: after the highest one, and never below Settings' first order no. */
  async nextNumber(db: Db = this.prisma): Promise<{ orderNo: number }> {
    const [max, setting] = await Promise.all([
      db.order.aggregate({ _max: { orderNo: true } }),
      db.setting.findUnique({ where: { id: 1 }, select: { firstOrderNo: true } }),
    ]);
    return { orderNo: Math.max((max._max.orderNo ?? 0) + 1, setting?.firstOrderNo ?? 1) };
  }

  // ── Writes ──

  async create(user: AuthUser, input: OrderInput, ip: string | null): Promise<OrderDetail> {
    // Two people saving at once can both pick the same next number; the loser retries.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await this.assertHeaderRefs(tx, input);
          const { lines, rateListId } = await this.bookLines(tx, user, input);
          const totals = calcOrderTotals(lines);
          const { orderNo } = await this.nextNumber(tx);
          const status: OrderStatus = hasPermission(user.role, 'order.manage')
            ? 'PENDING'
            : 'SUBMITTED';
          const created = await tx.order.create({
            data: {
              orderNo,
              status,
              ...this.headerData(input),
              rateListId,
              totalPacks: totals.totalPacks,
              totalWeightKg: totals.totalWeightKg.toString(),
              totalAmount: totals.totalAmount.toString(),
              createdById: user.id,
              lines: { create: lines },
              discounts: { create: await this.discountData(tx, input) },
            },
            select: { id: true },
          });
          const after = await this.get(user, created.id, tx);
          await this.audit.log(
            { userId: user.id, action: 'CREATE', entity: 'Order', entityId: created.id, after, ip },
            tx,
          );
          return after;
        });
      } catch (e) {
        const clash =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          JSON.stringify(e.meta ?? {}).includes('orderNo');
        if (!clash || attempt >= 3) throw e;
      }
    }
  }

  async update(
    user: AuthUser,
    id: string,
    input: OrderInput,
    ip: string | null,
  ): Promise<OrderDetail> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.get(user, id, tx);
      this.assertEditable(user, before, await this.createdBy(tx, id));
      await this.assertHeaderRefs(tx, input, before);
      const { lines, rateListId } = await this.bookLines(tx, user, input, before);
      const totals = calcOrderTotals(lines);
      await tx.orderLine.deleteMany({ where: { orderId: id } });
      await tx.orderDiscount.deleteMany({ where: { orderId: id } });
      await tx.order.update({
        where: { id },
        data: {
          ...this.headerData(input),
          rateListId: rateListId ?? before.rateList?.id ?? null,
          totalPacks: totals.totalPacks,
          totalWeightKg: totals.totalWeightKg.toString(),
          totalAmount: totals.totalAmount.toString(),
          updatedById: user.id,
          lines: { create: lines },
          discounts: { create: await this.discountData(tx, input) },
        },
      });
      const after = await this.get(user, id, tx);
      await this.audit.log(
        { userId: user.id, action: 'UPDATE', entity: 'Order', entityId: id, before, after, ip },
        tx,
      );
      return after;
    });
  }

  /** A salesman's order → Pending. */
  approve(user: AuthUser, id: string, ip: string | null) {
    return this.transition(user, id, ip, { from: ['SUBMITTED'], to: 'PENDING' });
  }

  reject(user: AuthUser, id: string, reason: string, ip: string | null) {
    return this.transition(user, id, ip, { from: ['SUBMITTED'], to: 'REJECTED', reason });
  }

  /** The office cancels any open order; a salesman can withdraw their own before approval. */
  async cancel(user: AuthUser, id: string, reason: string, ip: string | null) {
    const manage = hasPermission(user.role, 'order.manage');
    if (!manage) {
      const own = await this.createdBy(this.prisma, id);
      if (own !== user.id) {
        throw new ForbiddenException('You can only withdraw orders you entered.');
      }
    }
    return this.transition(user, id, ip, {
      from: manage ? ['SUBMITTED', 'PENDING'] : ['SUBMITTED'],
      to: 'CANCELLED',
      reason,
    });
  }

  /** Stop a pending order with bags still to deliver (the office). */
  close(user: AuthUser, id: string, reason: string, ip: string | null) {
    return this.transition(user, id, ip, { from: ['PENDING'], to: 'CLOSED', reason });
  }

  // ── Internals ──

  private async createdBy(db: Db, id: string): Promise<string | null> {
    const o = await db.order.findUnique({ where: { id }, select: { createdById: true } });
    return o?.createdById ?? null;
  }

  /** Office: any open order. Salesman: their own, until the office has approved it. */
  private assertEditable(user: AuthUser, order: OrderDetail, createdById: string | null) {
    if (hasPermission(user.role, 'order.manage')) {
      if (order.status !== 'SUBMITTED' && order.status !== 'PENDING') {
        throw new ConflictException(`Order ${order.orderNo} is ${order.status.toLowerCase()}.`);
      }
      return;
    }
    if (createdById !== user.id) {
      throw new ForbiddenException('You can only edit orders you entered.');
    }
    if (order.status !== 'SUBMITTED') {
      throw new ForbiddenException(
        `Order ${order.orderNo} has been ${order.status === 'PENDING' ? 'approved' : order.status.toLowerCase()}; ask the office to change it.`,
      );
    }
  }

  private async transition(
    user: AuthUser,
    id: string,
    ip: string | null,
    t: { from: OrderStatus[]; to: OrderStatus; reason?: string },
  ): Promise<OrderDetail> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.get(user, id, tx);
      if (!t.from.includes(before.status)) {
        throw new ConflictException(
          `Order ${before.orderNo} is ${before.status.toLowerCase()}, so it can't be ${
            { PENDING: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled', CLOSED: 'closed' }[
              t.to as 'PENDING' | 'REJECTED' | 'CANCELLED' | 'CLOSED'
            ]
          }.`,
        );
      }
      await tx.order.update({
        where: { id },
        data: {
          status: t.to,
          statusReason: t.reason ?? null,
          reviewedById: user.id,
          reviewedAt: new Date(),
          updatedById: user.id,
        },
      });
      const after = await this.get(user, id, tx);
      await this.audit.log(
        {
          userId: user.id,
          action: 'UPDATE',
          entity: 'Order',
          entityId: id,
          before: { status: before.status },
          after: { status: t.to, reason: t.reason ?? null },
          ip,
        },
        tx,
      );
      return after;
    });
  }

  /**
   * Prices each line. New lines take the current rate list's rate for that product and
   * crop year; lines already on the order keep their booked rate. Only the office may
   * set a different rate (and book an item that isn't on the list).
   */
  private async bookLines(
    db: Db,
    user: AuthUser,
    input: OrderInput,
    existing?: OrderDetail,
  ): Promise<{ lines: BookedLine[]; rateListId: string | null }> {
    const manage = hasPermission(user.role, 'order.manage');
    const current = await db.rateList.findFirst({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: 'desc' },
      select: {
        id: true,
        items: {
          select: { productId: true, cropYear: true, basis: true, rate: true, isAvailable: true },
        },
      },
    });
    const onList = new Map(
      (current?.items ?? []).map((i) => [lineKey(i.productId, i.cropYear || null), i]),
    );
    const booked = new Map(
      (existing?.lines ?? []).map((l) => [lineKey(l.product.id, l.cropYear), l]),
    );

    const products = await db.product.findMany({
      where: { id: { in: [...new Set(input.lines.map((l) => l.productId))] } },
      select: {
        id: true,
        name: true,
        isActive: true,
        unitWeightKg: true,
        packPcs: true,
        category: { select: { name: true } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const fail = (i: number, field: string, message: string): never => {
      throw new BadRequestException({
        message: `Line ${i + 1}: ${message}`,
        errors: [{ path: `lines.${i}.${field}`, message }],
      });
    };

    let usedList = false;
    const lines = input.lines.map((l, i): BookedLine => {
      const product = byId.get(l.productId);
      const key = lineKey(l.productId, l.cropYear);
      const kept = booked.get(key);
      if (!product) return fail(i, 'productId', 'product not found.');
      if (!product.isActive && !kept) return fail(i, 'productId', `${product.name} is inactive.`);

      const listed = onList.get(key);
      const listRate = listed?.isAvailable && listed.rate ? listed.rate.toString() : null;
      const label = `${product.name}${l.cropYear ? ` (${l.cropYear})` : ''}`;

      let basis: RateBasis;
      let rate: string;
      let bookedListRate: string | null;
      let weight: string;
      let pcs: number;
      if (kept) {
        // Already booked: keep its rate and pack snapshot (the office may re-price).
        basis = kept.basis;
        rate = manage && l.rate ? l.rate : kept.rate;
        bookedListRate = kept.listRate;
        weight = kept.packWeightKg;
        pcs = kept.packPcs;
      } else {
        if (listRate === null && !(manage && l.rate)) {
          return fail(
            i,
            'productId',
            manage
              ? `${label} is not on sale on the current rate list; enter a rate to book it anyway.`
              : `${label} is not on sale on the current rate list.`,
          );
        }
        if (listRate !== null) usedList = true;
        basis = listed?.basis ?? defaultRateBasis(product.category.name);
        rate = manage && l.rate ? l.rate : listRate!;
        bookedListRate = listRate;
        weight = packWeightKg(product.unitWeightKg.toString(), product.packPcs).toString();
        pcs = product.packPcs;
      }
      const calc = calcOrderLine({
        basis,
        rate,
        packWeightKg: weight,
        packPcs: pcs,
        qtyPacks: l.qtyPacks,
      });
      return {
        lineNo: i + 1,
        productId: product.id,
        cropYear: l.cropYear ?? '',
        basis,
        listRate: bookedListRate,
        rate,
        packWeightKg: weight,
        packPcs: pcs,
        qtyPacks: l.qtyPacks,
        ratePerPack: calc.ratePerPack.toString(),
        amount: calc.amount.toString(),
        weightKg: calc.weightKg.toString(),
      };
    });
    return { lines, rateListId: usedList ? (current?.id ?? null) : null };
  }

  private async discountData(db: Db, input: OrderInput) {
    const wanted = input.discounts.filter((d) => d.amount !== '0');
    if (!wanted.length) return [];
    const cats = await db.category.findMany({
      where: { id: { in: wanted.map((d) => d.categoryId) } },
      select: { id: true },
    });
    const found = new Set(cats.map((c) => c.id));
    wanted.forEach((d, i) => {
      if (!found.has(d.categoryId)) {
        throw new BadRequestException({
          message: 'Category not found.',
          errors: [{ path: `discounts.${i}.categoryId`, message: 'Category not found.' }],
        });
      }
    });
    return wanted.map((d) => ({ categoryId: d.categoryId, amount: d.amount }));
  }

  private headerData(input: OrderInput) {
    return {
      orderDate: toDbDate(input.orderDate),
      partyId: input.partyId,
      subPartyId: input.subPartyId,
      cityId: input.cityId,
      salespersonId: input.salespersonId,
      remarks: input.remarks,
    };
  }

  /** Same rules as invoices: active masters, and the sub-party must belong to the party. */
  private async assertHeaderRefs(db: Db, input: OrderInput, existing?: OrderDetail) {
    const bad = (path: string, message: string): never => {
      throw new BadRequestException({ message, errors: [{ path, message }] });
    };
    const active = { select: { isActive: true } } as const;
    const check = async (
      id: string | null,
      previous: string | null | undefined,
      row: Promise<{ isActive: boolean } | null>,
      path: string,
      message: string,
    ) => {
      if (!id) return;
      const r = await row;
      if (!r || (!r.isActive && id !== previous)) bad(path, message);
    };
    await check(
      input.partyId,
      existing?.party.id,
      db.party.findUnique({ where: { id: input.partyId }, ...active }),
      'partyId',
      'Select an active party.',
    );
    if (input.cityId) {
      await check(
        input.cityId,
        existing?.city?.id,
        db.city.findUnique({ where: { id: input.cityId }, ...active }),
        'cityId',
        'Select an active city.',
      );
    }
    if (input.salespersonId) {
      await check(
        input.salespersonId,
        existing?.salesperson?.id,
        db.salesperson.findUnique({ where: { id: input.salespersonId }, ...active }),
        'salespersonId',
        'Select an active salesperson.',
      );
    }
    if (input.subPartyId) {
      const sub = await db.subParty.findUnique({
        where: { id: input.subPartyId },
        select: { isActive: true, partyId: true },
      });
      if (
        !sub ||
        (!sub.isActive && input.subPartyId !== existing?.subParty?.id) ||
        (sub.partyId !== null && sub.partyId !== input.partyId)
      ) {
        bad('subPartyId', 'Select a sub-party of this party.');
      }
    }
  }
}
