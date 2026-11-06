import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AuthUser,
  calcLine,
  dec,
  defaultRateBasis,
  type InvoiceInput,
  normalizeAlias,
  normalizeCropYear,
  packWeightKg,
  type PdfImportDetail,
  type PdfImportQuery,
  type PdfImportRow,
  type PdfLinePlan,
  type PdfResolution,
  pdfResolutionSchema,
  type RateBasis,
} from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import { fromDbDate, toDbDate } from '../common/db-date';
import type { Prisma } from '../generated/prisma/client';
import { InvoicesService } from '../invoices/invoices.service';
import type { Db } from '../masters/master.service';
import { dispatchedOf } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { extractTextItems, type ParsedInvoice, parseInvoice } from './invoice-pdf';

type Ref = { id: string; name: string };

/** Everything decided for one PDF; `problems` empty = it can post. */
interface Plan {
  parsed: ParsedInvoice;
  duplicateOf: string | null;
  party: (Ref & { cityId: string | null; salespersonId: string | null }) | null;
  partySuggestion: Ref | null;
  city: Ref | null;
  salesperson: Ref | null;
  subParty: Ref | null;
  order: { id: string; orderNo: number } | null;
  goLiveDate: string | null;
  lines: (PdfLinePlan & { allocate: { orderLineId: string; qtyPacks: number }[] })[];
  problems: string[];
}

const GENERIC = new Set([
  'TRADERS',
  'TRADER',
  'AND',
  'CO',
  'SHOP',
  'COMMISSION',
  'ENTERPRISES',
  'ZAFARANI',
  'PURE',
  'KG',
  'GM',
  'X',
  'PER',
  'CARTON',
]);
const words = (s: string) =>
  normalizeAlias(s)
    .replace(/[.,&()=-]/g, ' ')
    .replace(/\b(TRD|TDR|TRDS)\b/g, 'TRADERS')
    .replace(/\bDASI\b/g, 'DESI')
    .split(' ')
    .filter((w) => w && !GENERIC.has(w) && !/^\d+(\.\d+)?(KG)?$/.test(w));

/** Closest name by shared words — a guess shown to the office, never applied by itself. */
function suggest(text: string, options: Ref[], fits: (r: Ref) => boolean = () => true): Ref | null {
  const want = new Set(words(text));
  let best: Ref | null = null;
  let score = 0;
  for (const o of options) {
    if (!fits(o)) continue;
    const have = words(o.name);
    if (!have.length || !want.size) continue;
    const s = have.filter((w) => want.has(w)).length / Math.max(want.size, have.length);
    if (s > score) [best, score] = [o, s];
  }
  return score >= 0.5 ? best : null;
}

/** "ASHFAQ COMMISSION SHOP - RAWALPINIDI" → "ASHFAQ COMMISSION SHOP" (the city suffix). */
const withoutCity = (party: string) => normalizeAlias(party.replace(/\s*-\s*[^-]*$/, ''));

/**
 * Invoice PDFs (docs/ORDERS_DELIVERY_SPEC.md §4). Each PDF is read, matched and checked;
 * if everything is clear it is posted at once — the invoice is recorded and its bags reduce
 * pending orders (same party, product, crop year and rate; oldest first) in one transaction.
 * Otherwise it waits in Needs review with the reasons.
 */
@Injectable()
export class InvoicePdfsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly invoices: InvoicesService,
  ) {}

  // ── Upload ──

  async upload(
    user: AuthUser,
    files: { buffer: Buffer; originalname: string }[],
    ip: string | null,
  ): Promise<PdfImportRow[]> {
    const rows: PdfImportRow[] = [];
    for (const f of files) {
      let parsed: ParsedInvoice;
      try {
        parsed = parseInvoice(await extractTextItems(f.buffer));
      } catch {
        parsed = parseInvoice([]);
        parsed.problems = ['This file could not be opened as a PDF.'];
      }
      const created = await this.prisma.pdfImport.create({
        data: {
          fileName: f.originalname,
          fileData: new Uint8Array(f.buffer),
          status: 'NEEDS_REVIEW',
          invoiceNo: parsed.invoiceNo,
          parsed: parsed as unknown as Prisma.InputJsonValue,
          problems: [],
          uploadedById: user.id,
        },
        select: { id: true },
      });
      rows.push(await this.settle(user, created.id, { lines: {} }, true, ip));
    }
    return rows;
  }

  /** Re-checks a PDF with the office's decisions; posts it when `post` and nothing is wrong. */
  async resolve(
    user: AuthUser,
    id: string,
    resolution: PdfResolution,
    post: boolean,
    ip: string | null,
  ) {
    await this.settle(user, id, resolution, post, ip);
    return this.get(id);
  }

  /**
   * Plans the PDF, stores the status and problems, and posts it if allowed. Posting happens
   * in one transaction with the plan recomputed inside it, so two PDFs can't both take the
   * same pending bags.
   */
  private async settle(
    user: AuthUser,
    id: string,
    resolution: PdfResolution,
    post: boolean,
    ip: string | null,
  ): Promise<PdfImportRow> {
    const imp = await this.prisma.pdfImport.findUnique({ where: { id } });
    if (!imp) throw new NotFoundException('PDF not found.');
    if (imp.status === 'POSTED' && imp.invoiceId) {
      throw new ConflictException('This PDF is already posted as an invoice.');
    }
    const parsed = imp.parsed as unknown as ParsedInvoice;
    await this.prisma.pdfImport.update({
      where: { id },
      data: { resolution: resolution as Prisma.InputJsonValue },
    });

    const plan = await this.plan(this.prisma, parsed, resolution);
    const status =
      parsed.problems.length && !parsed.lines.length
        ? 'FAILED'
        : plan.duplicateOf
          ? 'DUPLICATE'
          : 'NEEDS_REVIEW';
    if (!post || plan.problems.length || status !== 'NEEDS_REVIEW') {
      await this.prisma.pdfImport.update({
        where: { id },
        data: { status, problems: plan.problems },
      });
      return this.row(id);
    }

    await this.prisma.$transaction(
      async (tx) => {
        const fresh = await this.plan(tx, parsed, resolution);
        if (fresh.problems.length) {
          throw new ConflictException(fresh.problems[0]);
        }
        const input: InvoiceInput = {
          invoiceNo: parsed.invoiceNo!,
          invoiceDate: parsed.invoiceDate!,
          partyId: fresh.party!.id,
          cityId: fresh.city?.id ?? null,
          subPartyId: fresh.subParty?.id ?? null,
          salespersonId: fresh.salesperson?.id ?? null,
          remarks: `From PDF ${imp.fileName}`,
          lines: fresh.lines.map((l, i) => ({
            lineNo: i + 1,
            productId: l.product!.id,
            qtyPacks: l.qty,
            rate40Kg: dec(l.rate40Kg).toDecimalPlaces(2).toString(),
            rateBasis: l.basis!,
            ...(l.basis === 'PER_UNIT' ? { packRate: l.bagRate } : {}),
            cropYear: l.cropYear ?? '',
          })),
        };
        const invoiceId = await this.invoices.createInTx(tx, user, input, ip, {
          doNo: parsed.doNo || null,
          vehicleNo: parsed.vehicleNo || null,
          dcNo: parsed.dcNo || null,
          ogpNo: parsed.ogpNo || null,
          supplyNote: parsed.subParty || null,
        });
        const saved = await tx.invoiceLine.findMany({
          where: { invoiceId },
          select: { id: true, lineNo: true },
        });
        const lineId = new Map(saved.map((l) => [l.lineNo, l.id]));
        const allocations = fresh.lines.flatMap((l, i) =>
          l.allocate.map((a) => ({ ...a, invoiceLineId: lineId.get(i + 1)! })),
        );
        if (allocations.length) await tx.orderAllocation.createMany({ data: allocations });
        await this.remember(tx, user, parsed, resolution, fresh);
        await tx.pdfImport.update({
          where: { id },
          data: { status: 'POSTED', problems: [], invoiceId },
        });
        await this.audit.log(
          {
            userId: user.id,
            action: 'IMPORT',
            entity: 'InvoicePdf',
            entityId: id,
            after: {
              fileName: imp.fileName,
              invoiceNo: parsed.invoiceNo,
              invoiceId,
              deliveries: fresh.lines.map((l) => ({
                srNo: l.srNo,
                orders: l.allocations.map((a) => ({ orderNo: a.orderNo, qtyPacks: a.qtyPacks })),
              })),
            },
            ip,
          },
          tx,
        );
      },
      { timeout: 60_000 },
    );
    return this.row(id);
  }

  /** Saves the office's choices as names to recognise next time. */
  private async remember(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    parsed: ParsedInvoice,
    resolution: PdfResolution,
    plan: Plan,
  ) {
    const save = (kind: 'PARTY' | 'PRODUCT', text: string, targetId: string) =>
      tx.nameAlias.upsert({
        where: { kind_text_packKg: { kind, text, packKg: '' } },
        update: { targetId },
        create: { kind, text, packKg: '', targetId, createdById: user.id },
      });
    if (resolution.partyId && plan.party)
      await save('PARTY', normalizeAlias(parsed.party), plan.party.id);
    for (const l of plan.lines) {
      if (resolution.lines[String(l.srNo)]?.productId && l.product) {
        await save('PRODUCT', normalizeAlias(l.description), l.product.id);
      }
    }
  }

  // ── Planning ──

  private async plan(db: Db, parsed: ParsedInvoice, resolution: PdfResolution): Promise<Plan> {
    const problems: string[] = [...parsed.problems];
    const [setting, aliases, parties, products] = await Promise.all([
      db.setting.findUnique({ where: { id: 1 }, select: { ordersGoLiveDate: true } }),
      db.nameAlias.findMany({ where: { packKg: '' } }),
      db.party.findMany({
        where: { isActive: true },
        select: { id: true, name: true, cityId: true, salespersonId: true },
      }),
      db.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          unitWeightKg: true,
          packPcs: true,
          category: { select: { name: true } },
        },
      }),
    ]);
    const alias = (kind: string, text: string) =>
      aliases.find((a) => a.kind === kind && a.text === text)?.targetId;
    const goLiveDate = setting?.ordersGoLiveDate ? fromDbDate(setting.ordersGoLiveDate) : null;

    // Duplicate invoice number.
    const existing = parsed.invoiceNo
      ? await db.invoice.findFirst({
          where: { invoiceNo: parsed.invoiceNo, deletedAt: null },
          select: { id: true },
        })
      : null;
    if (existing) problems.push(`Invoice ${parsed.invoiceNo} is already recorded.`);

    // Party: the office's choice, a remembered name, the exact name, or the name without the city.
    const partyText = normalizeAlias(parsed.party);
    const partyId =
      resolution.partyId ??
      alias('PARTY', partyText) ??
      parties.find((p) => normalizeAlias(p.name) === partyText)?.id ??
      parties.find((p) => normalizeAlias(p.name) === withoutCity(parsed.party))?.id;
    const party = parties.find((p) => p.id === partyId) ?? null;
    const partySuggestion = party ? null : suggest(withoutCity(parsed.party), parties);
    if (!party) problems.push(`Choose the party for "${parsed.party}".`);

    const [city, salesperson, subParty] = await Promise.all([
      parsed.city
        ? db.city.findFirst({
            where: { name: { equals: parsed.city.trim(), mode: 'insensitive' } },
            select: { id: true, name: true },
          })
        : null,
      (resolution.salespersonId ?? party?.salespersonId)
        ? db.salesperson.findUnique({
            where: { id: (resolution.salespersonId ?? party?.salespersonId)! },
            select: { id: true, name: true },
          })
        : null,
      resolution.subPartyId
        ? db.subParty.findUnique({
            where: { id: resolution.subPartyId },
            select: { id: true, name: true },
          })
        : null,
    ]);
    const cityRef =
      city ??
      (party?.cityId
        ? await db.city.findUnique({
            where: { id: party.cityId },
            select: { id: true, name: true },
          })
        : null);

    // An order named on the invoice ("O.N 3159") or chosen by the office.
    let order: { id: string; orderNo: number } | null = null;
    if (resolution.orderId || parsed.orderNo) {
      const o = await db.order.findFirst({
        where: resolution.orderId ? { id: resolution.orderId } : { orderNo: parsed.orderNo! },
        select: { id: true, orderNo: true, partyId: true, status: true },
      });
      if (!o) problems.push(`Order ${parsed.orderNo} named on the invoice doesn't exist.`);
      else if (party && o.partyId !== party.id) {
        problems.push(`Order ${o.orderNo} is for another party.`);
      } else if (o.status !== 'PENDING') {
        problems.push(`Order ${o.orderNo} is ${o.status.toLowerCase()}, not pending.`);
      } else order = { id: o.id, orderNo: o.orderNo };
    }

    // Pending order lines of this party, oldest first (opening orders only after go-live).
    const beforeGoLive = !!goLiveDate && !!parsed.invoiceDate && parsed.invoiceDate <= goLiveDate;
    const candidates = party
      ? await db.orderLine.findMany({
          where: {
            order: {
              partyId: party.id,
              status: 'PENDING',
              ...(order ? { id: order.id } : {}),
              ...(parsed.invoiceDate ? { orderDate: { lte: toDbDate(parsed.invoiceDate) } } : {}),
              ...(beforeGoLive ? { isOpening: false } : {}),
            },
          },
          select: {
            id: true,
            productId: true,
            cropYear: true,
            basis: true,
            rate: true,
            ratePerPack: true,
            qtyPacks: true,
            openingDispatched: true,
            allocations: { select: { qtyPacks: true } },
            order: { select: { id: true, orderNo: true, orderDate: true, isOpening: true } },
          },
        })
      : [];
    candidates.sort(
      (a, b) =>
        a.order.orderDate.getTime() - b.order.orderDate.getTime() ||
        a.order.orderNo - b.order.orderNo,
    );
    const left = new Map(candidates.map((c) => [c.id, Math.max(0, c.qtyPacks - dispatchedOf(c))]));

    const productRefs = products.map((p) => ({ id: p.id, name: p.name }));
    const lines: Plan['lines'] = parsed.lines.map((l) => {
      const lineProblems: string[] = [];
      const desc = normalizeAlias(l.description);
      const choice = resolution.lines[String(l.srNo)];
      const productId =
        choice?.productId ??
        alias('PRODUCT', desc) ??
        products.find((p) => normalizeAlias(p.name) === desc)?.id;
      const product = products.find((p) => p.id === productId) ?? null;
      const qty = Number(l.qty);
      const crop = normalizeCropYear(l.cropYear);
      const base: Plan['lines'][number] = {
        srNo: l.srNo,
        description: l.description,
        cropYear: crop ?? null,
        qty,
        rate40Kg: l.rate40Kg,
        bagRate: l.bagRate,
        weight: l.weight,
        amount: l.amount,
        product: product ? { id: product.id, name: product.name } : null,
        productSuggestion: null,
        basis: null,
        computedAmount: null,
        allocations: [],
        unallocated: 0,
        allowWithoutOrder: !!choice?.allowWithoutOrder,
        problems: lineProblems,
        allocate: [],
      };
      if (crop === undefined) lineProblems.push(`Unreadable crop year "${l.cropYear}".`);
      if (!product) {
        base.productSuggestion = suggest(l.description, productRefs, (r) => {
          const p = products.find((x) => x.id === r.id)!;
          return (
            !l.weight ||
            !qty ||
            packWeightKg(p.unitWeightKg.toString(), p.packPcs).times(qty).eq(l.weight)
          );
        });
        lineProblems.push(`Choose the product for "${l.description}".`);
        return base;
      }
      // The weight on the invoice must fit the product's pack (catches 6- vs 12-tin cartons).
      const pack = packWeightKg(product.unitWeightKg.toString(), product.packPcs);
      if (l.weight && !pack.times(qty).eq(l.weight)) {
        lineProblems.push(
          `${qty} × ${product.name} (${pack.toString()} kg a pack) is ${pack.times(qty).toString()} kg, but the invoice says ${l.weight} kg.`,
        );
      }
      const basis: RateBasis = defaultRateBasis(product.category.name);
      base.basis = basis;
      if (basis === 'PER_UNIT' && !l.bagRate) lineProblems.push('The bag rate could not be read.');
      if (basis === 'PER_40KG' && !l.rate40Kg) lineProblems.push('The rate could not be read.');
      if (!lineProblems.length) {
        const calc = calcLine({
          qtyPacks: qty,
          packWeightKg: pack.toString(),
          rate40Kg: l.rate40Kg || '0',
          commissionRate: '0',
          rateBasis: basis,
          packRate: l.bagRate,
        });
        base.computedAmount = calc.amount.toString();
        if (!calc.amount.eq(l.amount)) {
          lineProblems.push(
            `The amount works out to ${calc.amount.toString()}, but the invoice says ${l.amount}.`,
          );
        }
      }

      // Deliver against pending orders: same product, crop year and rate; oldest first.
      if (!lineProblems.length) {
        let need = qty;
        for (const c of candidates) {
          if (need === 0) break;
          const free = left.get(c.id) ?? 0;
          if (!free || c.productId !== product.id) continue;
          if (crop && c.cropYear && c.cropYear !== crop) continue;
          const sameRate =
            c.basis === 'PER_UNIT'
              ? dec(c.ratePerPack).eq(l.bagRate || '0')
              : dec(c.rate).eq(l.rate40Kg || '0');
          if (!sameRate) continue;
          const take = Math.min(free, need);
          left.set(c.id, free - take);
          need -= take;
          base.allocate.push({ orderLineId: c.id, qtyPacks: take });
          base.allocations.push({
            orderId: c.order.id,
            orderNo: c.order.orderNo,
            orderDate: fromDbDate(c.order.orderDate),
            qtyPacks: take,
            isOpening: c.order.isOpening,
          });
        }
        base.unallocated = need;
        if (need > 0 && !base.allowWithoutOrder) {
          lineProblems.push(
            need === qty
              ? `No pending order${order ? ` ${order.orderNo}` : ''} for ${product.name}${crop ? ` (${crop})` : ''} at this rate.`
              : `${need} of ${qty} have no pending order at this rate.`,
          );
        }
      }
      return base;
    });

    for (const l of lines) for (const p of l.problems) problems.push(`Line ${l.srNo}: ${p}`);
    return {
      parsed,
      duplicateOf: existing?.id ?? null,
      party: party,
      partySuggestion,
      city: cityRef,
      salesperson,
      subParty,
      order,
      goLiveDate,
      lines,
      problems,
    };
  }

  // ── Reads ──

  private async row(id: string): Promise<PdfImportRow> {
    const r = await this.prisma.pdfImport.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        fileName: true,
        status: true,
        invoiceNo: true,
        parsed: true,
        problems: true,
        invoiceId: true,
        uploadedById: true,
        createdAt: true,
      },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: r.uploadedById },
      select: { name: true },
    });
    return this.toRow(r, user?.name ?? null);
  }

  private toRow(
    r: {
      id: string;
      fileName: string;
      status: PdfImportRow['status'];
      invoiceNo: number | null;
      parsed: unknown;
      problems: unknown;
      invoiceId: string | null;
      createdAt: Date;
    },
    uploadedBy: string | null,
  ): PdfImportRow {
    const p = r.parsed as ParsedInvoice;
    return {
      id: r.id,
      fileName: r.fileName,
      status: r.status,
      invoiceNo: r.invoiceNo,
      invoiceDate: p.invoiceDate ?? null,
      party: p.party ?? '',
      amount: p.totals?.amount ?? '',
      problems: (r.problems as string[]) ?? [],
      invoiceId: r.invoiceId,
      uploadedBy,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async list(q: PdfImportQuery) {
    const where = q.status ? { status: q.status } : {};
    const [total, rows, grouped] = await Promise.all([
      this.prisma.pdfImport.count({ where }),
      this.prisma.pdfImport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          fileName: true,
          status: true,
          invoiceNo: true,
          parsed: true,
          problems: true,
          invoiceId: true,
          uploadedById: true,
          createdAt: true,
        },
      }),
      this.prisma.pdfImport.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.uploadedById))] } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return {
      data: rows.map((r) => this.toRow(r, names.get(r.uploadedById) ?? null)),
      meta: { page: q.page, pageSize: q.pageSize, total },
      counts: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])),
    };
  }

  async get(id: string): Promise<PdfImportDetail> {
    const imp = await this.prisma.pdfImport.findUnique({ where: { id } });
    if (!imp) throw new NotFoundException('PDF not found.');
    const parsed = imp.parsed as unknown as ParsedInvoice;
    const resolution = pdfResolutionSchema.parse(imp.resolution ?? {});
    const row = await this.row(id);
    const plan =
      imp.status === 'POSTED' && imp.invoiceId
        ? null
        : await this.plan(this.prisma, parsed, resolution);
    // A posted PDF shows the deliveries it made.
    const posted = imp.invoiceId
      ? await this.prisma.invoiceLine.findMany({
          where: { invoiceId: imp.invoiceId },
          orderBy: { lineNo: 'asc' },
          select: {
            lineNo: true,
            product: { select: { id: true, name: true } },
            rateBasis: true,
            amount: true,
            allocations: {
              select: {
                qtyPacks: true,
                orderLine: {
                  select: {
                    order: {
                      select: { id: true, orderNo: true, orderDate: true, isOpening: true },
                    },
                  },
                },
              },
            },
          },
        })
      : [];
    const lines: PdfLinePlan[] = plan
      ? plan.lines.map(({ allocate: _a, ...l }) => l)
      : parsed.lines.map((l, i) => {
          const s = posted[i];
          return {
            srNo: l.srNo,
            description: l.description,
            cropYear: normalizeCropYear(l.cropYear) ?? null,
            qty: Number(l.qty),
            rate40Kg: l.rate40Kg,
            bagRate: l.bagRate,
            weight: l.weight,
            amount: l.amount,
            product: s?.product ?? null,
            productSuggestion: null,
            basis: s?.rateBasis ?? null,
            computedAmount: s?.amount.toString() ?? null,
            allocations: (s?.allocations ?? []).map((a) => ({
              orderId: a.orderLine.order.id,
              orderNo: a.orderLine.order.orderNo,
              orderDate: fromDbDate(a.orderLine.order.orderDate),
              qtyPacks: a.qtyPacks,
              isOpening: a.orderLine.order.isOpening,
            })),
            unallocated: Number(l.qty) - (s?.allocations ?? []).reduce((n, a) => n + a.qtyPacks, 0),
            allowWithoutOrder: false,
            problems: [],
          };
        });
    return {
      ...row,
      header: {
        party: parsed.party,
        subParty: parsed.subParty,
        city: parsed.city,
        doNo: parsed.doNo,
        vehicleNo: parsed.vehicleNo,
        dcNo: parsed.dcNo,
        ogpNo: parsed.ogpNo,
        orderNo: parsed.orderNo,
      },
      matched: {
        party: plan?.party ? { id: plan.party.id, name: plan.party.name } : null,
        partySuggestion: plan?.partySuggestion ?? null,
        city: plan?.city ?? null,
        salesperson: plan?.salesperson ?? null,
        subParty: plan?.subParty ?? null,
        order: plan?.order ?? null,
      },
      goLiveDate: plan?.goLiveDate ?? null,
      lines,
      totals: {
        qty: parsed.totals.qty,
        weight: parsed.totals.weight,
        amount: parsed.totals.amount,
      },
      resolution,
      ready: !!plan && plan.problems.length === 0 && !plan.duplicateOf,
    };
  }

  async file(id: string): Promise<{ name: string; data: Buffer }> {
    const imp = await this.prisma.pdfImport.findUnique({
      where: { id },
      select: { fileName: true, fileData: true },
    });
    if (!imp) throw new NotFoundException('PDF not found.');
    return { name: imp.fileName, data: Buffer.from(imp.fileData) };
  }

  /** Discard a PDF that wasn't posted (e.g. a duplicate or a wrong file). */
  async remove(user: AuthUser, id: string, ip: string | null): Promise<void> {
    const imp = await this.prisma.pdfImport.findUnique({
      where: { id },
      select: { status: true, invoiceId: true, fileName: true },
    });
    if (!imp) throw new NotFoundException('PDF not found.');
    if (imp.invoiceId) {
      throw new BadRequestException(
        'This PDF is posted. Delete its invoice first (that also frees the order bags).',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.pdfImport.delete({ where: { id } });
      await this.audit.log(
        { userId: user.id, action: 'DELETE', entity: 'InvoicePdf', entityId: id, before: imp, ip },
        tx,
      );
    });
  }
}
