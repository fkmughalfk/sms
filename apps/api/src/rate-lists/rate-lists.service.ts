import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AuthUser,
  categoryRank,
  defaultRateBasis,
  fromBusinessDateTime,
  packRate,
  packWeightKg,
  type Paginated,
  type RateBasis,
  type RateListDetail,
  type RateListDraft,
  type RateListInput,
  type RateListLine,
  type RateListProduct,
  type RateListQuery,
  type RateListStatus,
  type RateListSummary,
  toBusinessDateTime,
} from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../masters/master.service';
import { orNotFound, toPage } from '../masters/master-utils';
import { PrismaService } from '../prisma/prisma.service';

const productSelect = {
  id: true,
  name: true,
  sku: true,
  unitWeightKg: true,
  packPcs: true,
  isActive: true,
  category: { select: { name: true } },
} as const;
type ProductRec = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

const itemSelect = {
  productId: true,
  product: { select: productSelect },
  cropYear: true,
  basis: true,
  rate: true,
  isAvailable: true,
  note: true,
} as const;
type ItemRec = Prisma.RateListItemGetPayload<{ select: typeof itemSelect }>;

/** The rate fields of a line, before product details are attached. */
export interface LineValues {
  cropYear: string | null;
  basis: RateBasis;
  rate: string | null;
  isAvailable: boolean;
  note: string | null;
}

export const toProduct = (p: ProductRec): RateListProduct => ({
  id: p.id,
  name: p.name,
  sku: p.sku,
  packWeightKg: packWeightKg(p.unitWeightKg.toString(), p.packPcs).toString(),
  packPcs: p.packPcs,
  category: p.category.name,
  isActive: p.isActive,
});

const lineKey = (productId: string, cropYear: string | null) => `${productId}|${cropYear ?? ''}`;

/** A line as the API returns it: pack price worked out, previous rate attached. */
export function toLine(
  product: RateListProduct,
  v: LineValues,
  previous: Map<string, string | null>,
): RateListLine {
  return {
    productId: product.id,
    product,
    cropYear: v.cropYear,
    basis: v.basis,
    rate: v.rate,
    isAvailable: v.isAvailable,
    note: v.note,
    packRate:
      v.rate === null
        ? null
        : packRate(v.basis, v.rate, product.packWeightKg, product.packPcs).toString(),
    previousRate: previous.get(lineKey(product.id, v.cropYear)) ?? null,
  };
}

const itemValues = (i: ItemRec): LineValues => ({
  cropYear: i.cropYear === '' ? null : i.cropYear,
  basis: i.basis,
  rate: i.rate?.toString() ?? null,
  isAvailable: i.isAvailable,
  note: i.note,
});

/** Rate lists (docs/ORDERS_DELIVERY_SPEC.md §2). Every write: one transaction + audit entry. */
@Injectable()
export class RateListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The list in force at `now`: the newest one whose effectiveFrom has passed. */
  private currentId(db: Db, now = new Date()): Promise<string | null> {
    return db.rateList
      .findFirst({
        where: { effectiveFrom: { lte: now } },
        orderBy: { effectiveFrom: 'desc' },
        select: { id: true },
      })
      .then((r) => r?.id ?? null);
  }

  private status(effectiveFrom: Date, id: string, currentId: string | null): RateListStatus {
    if (id === currentId) return 'CURRENT';
    return effectiveFrom > new Date() ? 'UPCOMING' : 'PAST';
  }

  private async userNames(ids: string[], db: Db = this.prisma): Promise<Map<string, string>> {
    const users = await db.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  /** Newest first. */
  async list(query: RateListQuery): Promise<Paginated<RateListSummary>> {
    const [total, rows, currentId] = await Promise.all([
      this.prisma.rateList.count(),
      this.prisma.rateList.findMany({
        orderBy: { effectiveFrom: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          effectiveFrom: true,
          remarks: true,
          createdById: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      }),
      this.currentId(this.prisma),
    ]);
    const ids = rows.map((r) => r.id);
    const [available, names] = await Promise.all([
      this.prisma.rateListItem.groupBy({
        by: ['rateListId'],
        where: { rateListId: { in: ids }, isAvailable: true },
        _count: { _all: true },
      }),
      this.userNames(rows.map((r) => r.createdById)),
    ]);
    const availableBy = new Map(available.map((a) => [a.rateListId, a._count._all]));
    const data = rows.map((r) => ({
      id: r.id,
      effectiveFrom: toBusinessDateTime(r.effectiveFrom),
      remarks: r.remarks,
      status: this.status(r.effectiveFrom, r.id, currentId),
      itemCount: r._count.items,
      availableCount: availableBy.get(r.id) ?? 0,
      createdBy: names.get(r.createdById) ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    return toPage(data, total, query);
  }

  /** Rates on `listId`, keyed by product + crop year (null rate when N/A). */
  private async ratesOf(db: Db, listId: string | undefined): Promise<Map<string, string | null>> {
    if (!listId) return new Map();
    const items = await db.rateListItem.findMany({
      where: { rateListId: listId },
      select: { productId: true, cropYear: true, rate: true, isAvailable: true },
    });
    return new Map(
      items.map((i) => [
        lineKey(i.productId, i.cropYear || null),
        i.isAvailable ? (i.rate?.toString() ?? null) : null,
      ]),
    );
  }

  async get(id: string, db: Db = this.prisma): Promise<RateListDetail> {
    const list = orNotFound(
      await db.rateList.findUnique({
        where: { id },
        select: {
          id: true,
          effectiveFrom: true,
          remarks: true,
          createdById: true,
          createdAt: true,
          items: { select: itemSelect, orderBy: { lineNo: 'asc' } },
        },
      }),
      'Rate list',
    );
    const [previous, currentId, names] = await Promise.all([
      db.rateList.findFirst({
        where: { effectiveFrom: { lt: list.effectiveFrom } },
        orderBy: { effectiveFrom: 'desc' },
        select: { id: true, effectiveFrom: true },
      }),
      this.currentId(db),
      this.userNames([list.createdById], db),
    ]);
    const previousRates = await this.ratesOf(db, previous?.id);
    return {
      id: list.id,
      effectiveFrom: toBusinessDateTime(list.effectiveFrom),
      remarks: list.remarks,
      status: this.status(list.effectiveFrom, list.id, currentId),
      itemCount: list.items.length,
      availableCount: list.items.filter((i) => i.isAvailable).length,
      createdBy: names.get(list.createdById) ?? null,
      createdAt: list.createdAt.toISOString(),
      items: list.items.map((i) => toLine(toProduct(i.product), itemValues(i), previousRates)),
      previous: previous
        ? { id: previous.id, effectiveFrom: toBusinessDateTime(previous.effectiveFrom) }
        : null,
    };
  }

  /** The list in force now (orders book from this one). */
  async current(): Promise<RateListDetail> {
    const id = await this.currentId(this.prisma);
    if (!id) throw new NotFoundException('No rate list is in effect yet.');
    return this.get(id);
  }

  /**
   * Starting point for a new list: every active product, with the lines (crop years,
   * rates, notes) of `from` — the newest list when not given. Products not on that list
   * start as N/A so the office fills in only what it sells.
   */
  async draft(from?: string): Promise<RateListDraft> {
    const source = from
      ? await this.prisma.rateList.findUnique({
          where: { id: from },
          select: { id: true, effectiveFrom: true },
        })
      : await this.prisma.rateList.findFirst({
          orderBy: { effectiveFrom: 'desc' },
          select: { id: true, effectiveFrom: true },
        });
    if (from && !source) orNotFound(null, 'Rate list');

    const [products, items] = await Promise.all([
      this.prisma.product.findMany({
        where: { isActive: true },
        select: productSelect,
        orderBy: { sku: 'asc' },
      }),
      source
        ? this.prisma.rateListItem.findMany({
            where: { rateListId: source.id },
            select: itemSelect,
            orderBy: { lineNo: 'asc' },
          })
        : Promise.resolve([] as ItemRec[]),
    ]);
    products.sort((a, b) => categoryRank(a.category.name) - categoryRank(b.category.name));
    const previousRates = await this.ratesOf(this.prisma, source?.id);
    const byProduct = new Map<string, ItemRec[]>();
    for (const i of items) byProduct.set(i.productId, [...(byProduct.get(i.productId) ?? []), i]);

    const lines: RateListLine[] = [];
    for (const p of products) {
      const product = toProduct(p);
      const copied = byProduct.get(p.id);
      if (copied?.length) {
        for (const i of copied) lines.push(toLine(product, itemValues(i), previousRates));
      } else {
        lines.push(
          toLine(
            product,
            {
              cropYear: null,
              basis: defaultRateBasis(product.category),
              rate: null,
              isAvailable: false,
              note: null,
            },
            previousRates,
          ),
        );
      }
    }
    return {
      copiedFrom: source
        ? { id: source.id, effectiveFrom: toBusinessDateTime(source.effectiveFrom) }
        : null,
      items: lines,
    };
  }

  /**
   * Products must exist; inactive ones only on a list that already had them (editing an
   * old list keeps its history, but a deactivated product can't be added anew).
   */
  private async checkProducts(db: Db, input: RateListInput, existingIds = new Set<string>()) {
    const ids = [...new Set(input.items.map((i) => i.productId))];
    const found = await db.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, isActive: true },
    });
    const byId = new Map(found.map((p) => [p.id, p]));
    input.items.forEach((item, i) => {
      const p = byId.get(item.productId);
      if (!p) {
        throw new BadRequestException({
          message: `Line ${i + 1}: product not found.`,
          errors: [{ path: `items.${i}.productId`, message: 'Product not found.' }],
        });
      }
      if (!p.isActive && !existingIds.has(p.id)) {
        throw new BadRequestException({
          message: `Line ${i + 1}: ${p.name} is inactive.`,
          errors: [{ path: `items.${i}.productId`, message: 'This product is inactive.' }],
        });
      }
    });
  }

  private async assertFreeTime(db: Db, effectiveFrom: Date, exceptId?: string) {
    const clash = await db.rateList.findFirst({
      where: { effectiveFrom, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        'Another rate list already starts at this date and time. Pick a different time.',
      );
    }
  }

  private itemsData(input: RateListInput) {
    return input.items.map((i, n) => ({
      lineNo: n + 1,
      productId: i.productId,
      cropYear: i.cropYear ?? '',
      basis: i.basis,
      rate: i.rate,
      isAvailable: i.isAvailable,
      note: i.note,
    }));
  }

  async create(user: AuthUser, input: RateListInput, ip: string | null): Promise<RateListDetail> {
    const effectiveFrom = fromBusinessDateTime(input.effectiveFrom);
    return this.prisma.$transaction(async (tx) => {
      await this.checkProducts(tx, input);
      await this.assertFreeTime(tx, effectiveFrom);
      const created = await tx.rateList.create({
        data: {
          effectiveFrom,
          remarks: input.remarks,
          createdById: user.id,
          items: { create: this.itemsData(input) },
        },
        select: { id: true },
      });
      const after = await this.get(created.id, tx);
      await this.audit.log(
        { userId: user.id, action: 'CREATE', entity: 'RateList', entityId: created.id, after, ip },
        tx,
      );
      return after;
    });
  }

  /** Replaces the header and every line. */
  async update(
    user: AuthUser,
    id: string,
    input: RateListInput,
    ip: string | null,
  ): Promise<RateListDetail> {
    const effectiveFrom = fromBusinessDateTime(input.effectiveFrom);
    return this.prisma.$transaction(async (tx) => {
      const before = await this.get(id, tx);
      await this.checkProducts(tx, input, new Set(before.items.map((i) => i.productId)));
      await this.assertFreeTime(tx, effectiveFrom, id);
      await tx.rateListItem.deleteMany({ where: { rateListId: id } });
      await tx.rateList.update({
        where: { id },
        data: {
          effectiveFrom,
          remarks: input.remarks,
          updatedById: user.id,
          items: { create: this.itemsData(input) },
        },
      });
      const after = await this.get(id, tx);
      await this.audit.log(
        { userId: user.id, action: 'UPDATE', entity: 'RateList', entityId: id, before, after, ip },
        tx,
      );
      return after;
    });
  }

  /** Hard delete; the audit entry keeps the full list. */
  async remove(user: AuthUser, id: string, ip: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await this.get(id, tx);
      const orders = await tx.order.count({ where: { rateListId: id } });
      if (orders > 0) {
        throw new ConflictException(
          `${orders.toLocaleString('en-US')} order(s) were booked from this list, so it can't be deleted. Publish a new list instead.`,
        );
      }
      await tx.rateList.delete({ where: { id } });
      await this.audit.log(
        { userId: user.id, action: 'DELETE', entity: 'RateList', entityId: id, before, ip },
        tx,
      );
    });
  }

  /** All products, for matching uploaded rows. */
  async products(): Promise<RateListProduct[]> {
    const rows = await this.prisma.product.findMany({
      select: productSelect,
      orderBy: { sku: 'asc' },
    });
    return rows.map(toProduct);
  }

  /** Rates on the newest list, to show the change against an uploaded list. */
  async latestRates(): Promise<Map<string, string | null>> {
    const latest = await this.prisma.rateList.findFirst({
      orderBy: { effectiveFrom: 'desc' },
      select: { id: true },
    });
    return this.ratesOf(this.prisma, latest?.id);
  }
}
