import { Injectable } from '@nestjs/common';
import {
  commissionTotalRate,
  DEFAULT_COMMISSION_RATE,
  packWeightKg,
  type ProductInput,
  type ProductListQuery,
  type ProductOption,
  type ProductRow,
  resolveCommissionRate,
} from '@sms/shared';
import type { Prisma } from '../../generated/prisma/client';
import { byFields, byRelationName } from '../../common/sorting';
import { type Db, type MasterDelegate, MasterService, type Usage } from '../master.service';
import { assertActiveRef, assertUnique, nameContains, notId } from '../master-utils';

const select = {
  id: true,
  sku: true,
  name: true,
  unitWeightKg: true,
  packPcs: true,
  categoryId: true,
  category: { select: { id: true, name: true, commissionRate: true } },
  commissionRate: true,
  isActive: true,
} as const;
type Rec = Prisma.ProductGetPayload<{ select: typeof select }>;

/** Settings default commission rate (spec §6.1 fallback). */
export async function defaultCommissionRate(db: Db): Promise<string> {
  const setting = await db.setting.findUnique({
    where: { id: 1 },
    select: { defaultCommissionRate: true },
  });
  return setting?.defaultCommissionRate.toString() ?? DEFAULT_COMMISSION_RATE;
}

/** What a product's effective commission rate depends on besides the product itself. */
interface RateContext {
  defaultRate: string;
  /** The rate per category of the salesman who earns on all sales (commission spec), if any. */
  overrider: Record<string, string>;
}

async function rateContext(db: Db): Promise<RateContext> {
  const [defaultRate, overrider] = await Promise.all([
    defaultCommissionRate(db),
    db.salesperson.findFirst({
      where: { earnsOnAllSales: true },
      select: { commissionRates: { select: { categoryId: true, rate: true } } },
    }),
  ]);
  return {
    defaultRate,
    overrider: Object.fromEntries(
      (overrider?.commissionRates ?? []).map((r) => [r.categoryId, r.rate.toString()]),
    ),
  };
}

@Injectable()
export class ProductsService extends MasterService<
  Rec,
  ProductRow,
  ProductInput,
  ProductListQuery
> {
  protected readonly entity = 'Product';
  protected readonly label = 'product';
  protected readonly select = select;
  protected override readonly sortColumns = {
    ...byFields('sku', 'unitWeightKg', 'packPcs', 'commissionRate'),
    category: byRelationName('category'),
  };

  protected delegate(db: Db) {
    return db.product as unknown as MasterDelegate<Rec>;
  }

  protected override loadContext(db: Db): Promise<RateContext> {
    return rateContext(db);
  }

  /** The effective rate is what a new invoice line would get (same rule as invoices). */
  protected override toRow(rec: Rec, context: unknown): ProductRow {
    const { category, ...rest } = rec;
    const ctx = context as RateContext;
    return {
      ...rest,
      unitWeightKg: rec.unitWeightKg.toString(),
      packWeightKg: packWeightKg(rec.unitWeightKg.toString(), rec.packPcs).toString(),
      category: { id: category.id, name: category.name },
      commissionRate: rec.commissionRate?.toString() ?? null,
      effectiveCommissionRate: commissionTotalRate(
        { overrider: { salespersonId: '', rates: ctx.overrider }, shares: [] },
        rec.categoryId,
        resolveCommissionRate(
          rec.commissionRate?.toString(),
          category.commissionRate?.toString(),
          ctx.defaultRate,
        ),
      ).toString(),
    };
  }

  /** Search matches the name or the product # ("sku"). */
  protected override listWhere(query: ProductListQuery): object {
    const search = query.search;
    const sku = search && /^\d+$/.test(search) ? Number(search) : undefined;
    return {
      ...(search ? { OR: [nameContains(search), ...(sku ? [{ sku }] : [])] } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };
  }

  protected override async beforeWrite(db: Db, input: Partial<ProductInput>, existing?: Rec) {
    if (input.sku !== undefined && input.sku !== existing?.sku) {
      const clash = await db.product.findFirst({
        where: { sku: input.sku, ...notId(existing?.id) },
        select: { id: true },
      });
      assertUnique(clash, `Product # ${input.sku} already exists.`);
    }
    if (input.categoryId !== undefined && input.categoryId !== existing?.categoryId) {
      const category = await db.category.findUnique({
        where: { id: input.categoryId },
        select: { isActive: true },
      });
      assertActiveRef(category, 'Select an active category.');
    }
  }

  /** Dropdown rows for the invoice grid: pack weight and today's effective rate included. */
  async productOptions(): Promise<ProductOption[]> {
    const [rows, context] = await Promise.all([
      this.prisma.product.findMany({ where: { isActive: true }, select, orderBy: { name: 'asc' } }),
      rateContext(this.prisma),
    ]);
    return rows.map((rec) => {
      const row = this.toRow(rec, context);
      return {
        id: row.id,
        name: row.name,
        sku: row.sku,
        packWeightKg: row.packWeightKg,
        effectiveCommissionRate: row.effectiveCommissionRate,
        categoryId: row.categoryId,
      };
    });
  }

  protected async usage(db: Db, id: string): Promise<Usage[]> {
    return [
      ['invoice line', 'invoice lines', await db.invoiceLine.count({ where: { productId: id } })],
      [
        'rate list line',
        'rate list lines',
        await db.rateListItem.count({ where: { productId: id } }),
      ],
      ['order line', 'order lines', await db.orderLine.count({ where: { productId: id } })],
    ];
  }
}
