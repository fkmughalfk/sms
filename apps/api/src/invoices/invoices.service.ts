import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AuthUser,
  calcInvoice,
  canEditInvoice,
  hasPermission,
  type InvoiceDetail,
  type InvoiceFilter,
  type InvoiceInput,
  type InvoiceLineList,
  type InvoiceList,
  type InvoiceListQuery,
  type InvoiceLineInput,
  type InvoicePreview,
  type LineResult,
  monthRange,
  packWeightKg,
  resolveCommissionRate,
  type Totals,
} from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import { invoiceScope } from '../common/data-scope';
import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../masters/master.service';
import { listArgs } from '../masters/master-utils';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  fromDbDate,
  invoiceLineSelect,
  invoiceRowSelect,
  toDbDate,
  toInvoiceLine,
  toInvoiceRow,
  toTotals,
} from './invoice-mappers';

const ref = { select: { id: true, name: true } } as const;

type ExistingInvoice = Prisma.InvoiceGetPayload<{
  include: { lines: { select: { productId: true; packWeightKg: true; commissionRate: true } } };
}>;

interface Snapshot {
  packWeightKg: string;
  commissionRate: string;
}

type CalculatedLine = InvoiceLineInput & Snapshot & LineResult;
type CalcTotals = Totals;

const lineRowSelect = {
  ...invoiceLineSelect,
  product: { select: { id: true, name: true, sku: true, category: ref } },
  invoice: {
    select: {
      id: true,
      invoiceNo: true,
      invoiceDate: true,
      party: ref,
      city: ref,
      salesperson: ref,
    },
  },
} satisfies Prisma.InvoiceLineSelect;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ── Queries ──

  async list(user: AuthUser, query: InvoiceListQuery): Promise<InvoiceList> {
    const where = this.invoiceWhere(user, query);
    const { skip, take, orderBy } = listArgs(
      query,
      ['invoiceNo', 'invoiceDate', 'totalAmount'],
      'invoiceDate',
    );
    const desc = !query.sort || query.sort.endsWith(':desc');
    const [rows, total, sums] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        select: invoiceRowSelect,
        skip,
        take,
        orderBy: [orderBy, { invoiceNo: desc ? 'desc' : 'asc' }],
      }),
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.aggregate({
        where,
        _sum: { totalPacks: true, totalWeightKg: true, totalAmount: true, totalCommission: true },
      }),
    ]);
    return {
      data: rows.map(toInvoiceRow),
      meta: { page: query.page, pageSize: query.pageSize, total },
      totals: toTotals({
        invoices: total,
        packs: sums._sum.totalPacks,
        weightKg: sums._sum.totalWeightKg,
        amount: sums._sum.totalAmount,
        commission: sums._sum.totalCommission,
      }),
    };
  }

  /** One row per line (the Excel `tblLines`), totals over the filtered lines. */
  async lines(user: AuthUser, query: InvoiceListQuery): Promise<InvoiceLineList> {
    const where = this.lineWhere(user, query);
    const [rows, total, sums, invoices] = await Promise.all([
      this.prisma.invoiceLine.findMany({
        where,
        select: lineRowSelect,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [
          { invoice: { invoiceDate: 'desc' } },
          { invoice: { invoiceNo: 'desc' } },
          { lineNo: 'asc' },
        ],
      }),
      this.prisma.invoiceLine.count({ where }),
      this.prisma.invoiceLine.aggregate({
        where,
        _sum: { qtyPacks: true, weightKg: true, amount: true, commission: true },
      }),
      this.prisma.invoice.count({ where: { lines: { some: where } } }),
    ]);
    return {
      data: rows.map((l) => this.toLineRow(l)),
      meta: { page: query.page, pageSize: query.pageSize, total },
      totals: toTotals({
        invoices,
        packs: sums._sum.qtyPacks,
        weightKg: sums._sum.weightKg,
        amount: sums._sum.amount,
        commission: sums._sum.commission,
      }),
    };
  }

  /** All filtered lines for the Excel export (capped). */
  async exportLines(user: AuthUser, filter: InvoiceFilter) {
    const rows = await this.prisma.invoiceLine.findMany({
      where: this.lineWhere(user, filter),
      select: lineRowSelect,
      take: 100_000,
      orderBy: [
        { invoice: { invoiceDate: 'asc' } },
        { invoice: { invoiceNo: 'asc' } },
        { lineNo: 'asc' },
      ],
    });
    return rows.map((l) => this.toLineRow(l));
  }

  async get(user: AuthUser, id: string): Promise<InvoiceDetail> {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null, ...invoiceScope(user) },
      select: {
        ...invoiceRowSelect,
        lines: { select: invoiceLineSelect, orderBy: { lineNo: 'asc' } },
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!inv) throw new NotFoundException('Invoice not found.');

    const [creator, settings] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: inv.createdById },
        select: { id: true, name: true },
      }),
      this.settings.get(),
    ]);
    return {
      ...toInvoiceRow(inv),
      lines: inv.lines.map(toInvoiceLine),
      createdBy: creator ?? { id: inv.createdById, name: 'Unknown' },
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
      canEdit: canEditInvoice(user, inv, settings.userEditWindowHours),
      canDelete: hasPermission(user.role, 'invoice.delete'),
    };
  }

  async nextNumber(): Promise<{ invoiceNo: number }> {
    // Includes soft-deleted invoices: their numbers stay reserved.
    const max = await this.prisma.invoice.aggregate({ _max: { invoiceNo: true } });
    return { invoiceNo: (max._max.invoiceNo ?? 0) + 1 };
  }

  /** Calculates lines and totals from current product data without saving (spec §7). */
  async preview(input: InvoiceInput): Promise<InvoicePreview> {
    const { lines, totals, products } = await this.calculate(this.prisma, input);
    return {
      lines: lines.map((l) => ({
        lineNo: l.lineNo,
        product: products.get(l.productId)!,
        qtyPacks: l.qtyPacks,
        rate40Kg: l.rate40Kg,
        packWeightKg: l.packWeightKg,
        commissionRate: l.commissionRate,
        ratePerPack: l.ratePerPack.toString(),
        amount: l.amount.toString(),
        commission: l.commission.toString(),
        weightKg: l.weightKg.toString(),
      })),
      totals: toTotals({
        invoices: 1,
        packs: totals.totalPacks,
        weightKg: totals.totalWeightKg,
        amount: totals.totalAmount,
        commission: totals.totalCommission,
      }),
    };
  }

  // ── Writes (one transaction each, with an audit entry — CLAUDE.md rule 7) ──

  async create(user: AuthUser, input: InvoiceInput, ip: string | null): Promise<InvoiceDetail> {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.assertInvoiceNoFree(tx, input.invoiceNo);
      const { lines, totals } = await this.calculate(tx, input);
      const created = await tx.invoice.create({
        data: {
          ...this.headerData(input),
          ...this.totalsData(totals),
          createdById: user.id,
          lines: { create: lines.map((l) => this.lineData(l)) },
        },
        select: { id: true },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'CREATE',
          entity: 'Invoice',
          entityId: created.id,
          after: this.auditSnapshot(input, totals),
          ip,
        },
        tx,
      );
      return created.id;
    });
    return this.get(user, id);
  }

  async update(
    user: AuthUser,
    id: string,
    input: InvoiceInput,
    ip: string | null,
  ): Promise<InvoiceDetail> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.findEditable(tx, user, id);
      if (input.invoiceNo !== existing.invoiceNo)
        await this.assertInvoiceNoFree(tx, input.invoiceNo);

      const { lines, totals } = await this.calculate(tx, input, existing);
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({
        where: { id },
        data: {
          ...this.headerData(input),
          ...this.totalsData(totals),
          updatedById: user.id,
          lines: { create: lines.map((l) => this.lineData(l)) },
        },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'UPDATE',
          entity: 'Invoice',
          entityId: id,
          before: {
            invoiceNo: existing.invoiceNo,
            invoiceDate: fromDbDate(existing.invoiceDate),
            partyId: existing.partyId,
            totalAmount: existing.totalAmount.toString(),
            totalCommission: existing.totalCommission.toString(),
            totalPacks: existing.totalPacks,
            lines: existing.lines.length,
          },
          after: this.auditSnapshot(input, totals),
          ip,
        },
        tx,
      );
    });
    return this.get(user, id);
  }

  /** Soft delete (CLAUDE.md rule 6). The invoice number stays reserved. */
  async remove(user: AuthUser, id: string, ip: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findFirst({
        where: { id, deletedAt: null, ...invoiceScope(user) },
        select: {
          id: true,
          invoiceNo: true,
          totalAmount: true,
          _count: { select: { lines: true } },
        },
      });
      if (!inv) throw new NotFoundException('Invoice not found.');
      await tx.invoice.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: user.id },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'DELETE',
          entity: 'Invoice',
          entityId: id,
          before: {
            invoiceNo: inv.invoiceNo,
            totalAmount: inv.totalAmount.toString(),
            lines: inv._count.lines,
          },
          ip,
        },
        tx,
      );
    });
  }

  // ── Internals ──

  private async findEditable(db: Db, user: AuthUser, id: string): Promise<ExistingInvoice> {
    const existing = await db.invoice.findFirst({
      where: { id, deletedAt: null, ...invoiceScope(user) },
      include: {
        lines: {
          select: { productId: true, packWeightKg: true, commissionRate: true },
          orderBy: { lineNo: 'asc' },
        },
      },
    });
    if (!existing) throw new NotFoundException('Invoice not found.');
    const { userEditWindowHours } = await this.settings.get(db);
    if (!canEditInvoice(user, existing, userEditWindowHours)) {
      throw new ForbiddenException(
        `You can only edit your own invoices within ${userEditWindowHours} hours of creating them.`,
      );
    }
    return existing;
  }

  /** Spec §5.2: never silently overwrite — tell the UI which invoice holds the number. */
  private async assertInvoiceNoFree(db: Db, invoiceNo: number) {
    const taken = await db.invoice.findUnique({
      where: { invoiceNo },
      select: { id: true, deletedAt: true },
    });
    if (!taken) return;
    throw new ConflictException({
      message: taken.deletedAt
        ? `Invoice No. ${invoiceNo} belonged to a deleted invoice and can't be reused.`
        : `Invoice ${invoiceNo} already exists.`,
      code: 'INVOICE_EXISTS',
      invoiceId: taken.deletedAt ? null : taken.id,
    });
  }

  /**
   * Validates references, snapshots pack weight + commission rate per line
   * (CLAUDE.md rule 4) and recomputes everything with the shared calc (rule 2).
   *
   * On edit, a line whose product was already on the invoice keeps that line's
   * snapshot, so re-saving never rewrites history after a product/rate change.
   * Inactive masters are only accepted if the invoice already used them.
   */
  private async calculate(db: Db, input: InvoiceInput, existing?: ExistingInvoice) {
    await this.assertHeaderRefs(db, input, existing);

    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    const [products, settings] = await Promise.all([
      db.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          sku: true,
          unitWeightKg: true,
          packPcs: true,
          commissionRate: true,
          isActive: true,
          category: { select: { commissionRate: true } },
        },
      }),
      this.settings.get(db),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));

    // Old snapshots per product, consumed in line order.
    const oldSnapshots = new Map<string, Snapshot[]>();
    for (const l of existing?.lines ?? []) {
      const list = oldSnapshots.get(l.productId) ?? [];
      list.push({
        packWeightKg: l.packWeightKg.toString(),
        commissionRate: l.commissionRate.toString(),
      });
      oldSnapshots.set(l.productId, list);
    }
    const previouslyUsed = new Set(existing?.lines.map((l) => l.productId));

    const withSnapshots = input.lines.map((line) => {
      const product = byId.get(line.productId);
      if (!product || (!product.isActive && !previouslyUsed.has(line.productId))) {
        throw new BadRequestException({
          message: `Line ${line.lineNo}: select an active product.`,
          errors: [
            {
              path: `lines.${line.lineNo - 1}.productId`,
              message: `Line ${line.lineNo}: select an active product.`,
            },
          ],
        });
      }
      const snapshot = oldSnapshots.get(line.productId)?.shift() ?? {
        packWeightKg: packWeightKg(product.unitWeightKg.toString(), product.packPcs).toString(),
        commissionRate: resolveCommissionRate(
          product.commissionRate?.toString(),
          product.category.commissionRate?.toString(),
          settings.defaultCommissionRate,
        ).toString(),
      };
      return { ...line, ...snapshot };
    });

    const { lines, totals } = calcInvoice(withSnapshots);
    const productRefs = new Map(
      products.map((p) => [p.id, { id: p.id, name: p.name, sku: p.sku }]),
    );
    return { lines, totals, products: productRefs };
  }

  private async assertHeaderRefs(db: Db, input: InvoiceInput, existing?: ExistingInvoice) {
    const check = async (
      id: string | null,
      previous: string | null | undefined,
      find: (id: string) => Promise<{ isActive: boolean } | null>,
      field: string,
      message: string,
    ) => {
      if (!id) return;
      const row = await find(id);
      if (!row || (!row.isActive && id !== previous)) {
        throw new BadRequestException({ message, errors: [{ path: field, message }] });
      }
    };
    const active = { select: { isActive: true } } as const;

    await check(
      input.partyId,
      existing?.partyId,
      (id) => db.party.findUnique({ where: { id }, ...active }),
      'partyId',
      'Enter the Party (Name).',
    );
    await check(
      input.cityId,
      existing?.cityId,
      (id) => db.city.findUnique({ where: { id }, ...active }),
      'cityId',
      'Select an active city.',
    );
    await check(
      input.salespersonId,
      existing?.salespersonId,
      (id) => db.salesperson.findUnique({ where: { id }, ...active }),
      'salespersonId',
      'Select an active salesperson.',
    );

    if (input.subPartyId) {
      const sub = await db.subParty.findUnique({
        where: { id: input.subPartyId },
        select: { isActive: true, partyId: true },
      });
      const message = 'Select a sub-party of this party.';
      if (
        !sub ||
        (!sub.isActive && input.subPartyId !== existing?.subPartyId) ||
        (sub.partyId !== null && sub.partyId !== input.partyId)
      ) {
        throw new BadRequestException({ message, errors: [{ path: 'subPartyId', message }] });
      }
    }
  }

  private headerData(input: InvoiceInput) {
    return {
      invoiceNo: input.invoiceNo,
      invoiceDate: toDbDate(input.invoiceDate),
      partyId: input.partyId,
      cityId: input.cityId,
      subPartyId: input.subPartyId,
      salespersonId: input.salespersonId,
      remarks: input.remarks,
    };
  }

  private totalsData(totals: CalcTotals) {
    return {
      totalPacks: totals.totalPacks,
      totalWeightKg: totals.totalWeightKg.toString(),
      totalAmount: totals.totalAmount.toString(),
      totalCommission: totals.totalCommission.toString(),
    };
  }

  private lineData(l: CalculatedLine) {
    return {
      lineNo: l.lineNo,
      productId: l.productId,
      qtyPacks: l.qtyPacks,
      rate40Kg: l.rate40Kg,
      packWeightKg: l.packWeightKg,
      commissionRate: l.commissionRate,
      ratePerPack: l.ratePerPack.toString(),
      amount: l.amount.toString(),
      commission: l.commission.toString(),
      weightKg: l.weightKg.toString(),
    };
  }

  private auditSnapshot(input: InvoiceInput, totals: CalcTotals) {
    return {
      ...input,
      totalPacks: totals.totalPacks,
      totalAmount: totals.totalAmount.toString(),
      totalCommission: totals.totalCommission.toString(),
      totalWeightKg: totals.totalWeightKg.toString(),
    };
  }

  /** Header filters (spec §5.3) + soft-delete + the user's data scope. */
  private invoiceWhere(user: AuthUser, f: InvoiceFilter): Prisma.InvoiceWhereInput {
    const range =
      f.from || f.to ? { from: f.from, to: f.to } : f.month ? monthRange(f.month) : null;
    const lineFilter: Prisma.InvoiceLineWhereInput = {
      ...(f.productId ? { productId: f.productId } : {}),
      ...(f.categoryId ? { product: { categoryId: f.categoryId } } : {}),
    };
    return {
      deletedAt: null,
      ...invoiceScope(user),
      ...(range
        ? {
            invoiceDate: {
              ...(range.from ? { gte: toDbDate(range.from) } : {}),
              ...(range.to ? { lte: toDbDate(range.to) } : {}),
            },
          }
        : {}),
      ...(f.partyId ? { partyId: f.partyId } : {}),
      ...(f.cityId ? { cityId: f.cityId } : {}),
      ...(f.salespersonId ? { salespersonId: f.salespersonId } : {}),
      ...(f.invoiceNo ? { invoiceNo: f.invoiceNo } : {}),
      ...(Object.keys(lineFilter).length ? { lines: { some: lineFilter } } : {}),
    };
  }

  private lineWhere(user: AuthUser, f: InvoiceFilter): Prisma.InvoiceLineWhereInput {
    const { productId, categoryId, ...header } = f;
    return {
      invoice: this.invoiceWhere(user, header),
      ...(productId ? { productId } : {}),
      ...(categoryId ? { product: { categoryId } } : {}),
    };
  }

  private toLineRow(l: Prisma.InvoiceLineGetPayload<{ select: typeof lineRowSelect }>) {
    const { invoice, product } = l;
    return {
      ...toInvoiceLine({ ...l, product: { id: product.id, name: product.name, sku: product.sku } }),
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      invoiceDate: fromDbDate(invoice.invoiceDate),
      party: invoice.party,
      city: invoice.city,
      salesperson: invoice.salesperson,
      category: product.category,
    };
  }
}
