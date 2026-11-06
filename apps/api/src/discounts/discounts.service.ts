import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  addDays,
  type AuthUser,
  dec,
  type DiscountPart,
  discountUnit,
  earnedDiscounts,
  type PartyDiscounts,
  promptDiscount,
} from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import { fromDbDate, toDbDate } from '../common/db-date';
import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../masters/master.service';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/**
 * Prompt-payment discount (docs/ORDERS_DELIVERY_SPEC.md §6). An invoice that delivers
 * orders carries the orders' discount; when the whole invoice is cleared within the
 * party's credit days the discount is credited to the ledger automatically, and taken
 * back automatically if a later change means it is no longer earned. The office can
 * reverse a credit (with a reason); a reversed credit is never re-credited.
 */
@Injectable()
export class DiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Works out what an invoice can earn from the order lines it delivers (their order's
   * discount for the product's category × the delivered weight) and records it with the
   * party's credit days.
   */
  async applyInvoiceDiscount(tx: Tx, invoiceId: string): Promise<void> {
    const inv = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: {
        party: { select: { creditDays: true } },
        lines: {
          select: {
            packWeightKg: true,
            product: { select: { categoryId: true, category: { select: { name: true } } } },
            allocations: {
              select: {
                qtyPacks: true,
                orderLine: { select: { order: { select: { discounts: true } } } },
              },
            },
          },
        },
      },
    });
    const parts: DiscountPart[] = [];
    for (const l of inv.lines) {
      for (const a of l.allocations) {
        const d = a.orderLine.order.discounts.find((x) => x.categoryId === l.product.categoryId);
        if (!d || dec(d.amount.toString()).lte(0)) continue;
        parts.push({
          unit: discountUnit(l.product.category.name),
          rate: d.amount.toString(),
          weightKg: dec(l.packWeightKg.toString()).times(a.qtyPacks).toString(),
        });
      }
    }
    const setting = await tx.setting.findUnique({
      where: { id: 1 },
      select: { defaultCreditDays: true },
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        promptDiscount: promptDiscount(parts).toString(),
        creditDays: inv.party.creditDays ?? setting?.defaultCreditDays ?? 30,
      },
    });
  }

  /** Brings the party's discount credits in line with its invoices and payments. */
  async reconcile(tx: Tx, partyId: string, userId: string | null, ip: string | null = null) {
    const [party, invoices, payments, credits, setting] = await Promise.all([
      tx.party.findUnique({
        where: { id: partyId },
        select: { openingBalance: true, creditDays: true },
      }),
      tx.invoice.findMany({
        where: { partyId, deletedAt: null },
        select: {
          id: true,
          invoiceNo: true,
          invoiceDate: true,
          totalAmount: true,
          promptDiscount: true,
          creditDays: true,
        },
      }),
      tx.payment.findMany({
        where: { partyId, deletedAt: null },
        select: { paymentDate: true, amount: true },
      }),
      tx.discountCredit.findMany({ where: { partyId } }),
      tx.setting.findUnique({ where: { id: 1 }, select: { defaultCreditDays: true } }),
    ]);
    if (!party) return;
    const reversed = new Set(
      credits.filter((c) => c.status === 'REVERSED').map((c) => c.invoiceId),
    );
    const fallbackDays = party.creditDays ?? setting?.defaultCreditDays ?? 30;
    const earned = earnedDiscounts({
      openingBalance: party.openingBalance.toString(),
      invoices: invoices.map((i) => ({
        id: i.id,
        date: fromDbDate(i.invoiceDate),
        sortKey: String(i.invoiceNo).padStart(10, '0'),
        amount: i.totalAmount.toString(),
        discount: i.promptDiscount.toString(),
        creditDays: i.creditDays ?? fallbackDays,
      })),
      payments: payments.map((p) => ({
        date: fromDbDate(p.paymentDate),
        amount: p.amount.toString(),
      })),
      excluded: reversed,
    });
    const earnedBy = new Map(earned.map((e) => [e.invoiceId, e]));
    const log = (
      action: 'CREATE' | 'UPDATE' | 'DELETE',
      entityId: string,
      before: unknown,
      after: unknown,
    ) =>
      this.audit.log({ userId, action, entity: 'DiscountCredit', entityId, before, after, ip }, tx);

    for (const c of credits) {
      if (c.status !== 'ACTIVE') continue;
      const e = earnedBy.get(c.invoiceId);
      if (!e) {
        // No longer earned (e.g. a payment was deleted): taken back.
        await tx.discountCredit.delete({ where: { id: c.id } });
        await log(
          'DELETE',
          c.id,
          { invoiceId: c.invoiceId, amount: c.amount.toString(), automatic: true },
          null,
        );
      } else if (!e.amount.eq(c.amount.toString()) || e.date !== fromDbDate(c.creditDate)) {
        await tx.discountCredit.update({
          where: { id: c.id },
          data: { amount: e.amount.toString(), creditDate: toDbDate(e.date) },
        });
        await log(
          'UPDATE',
          c.id,
          { amount: c.amount.toString(), creditDate: fromDbDate(c.creditDate) },
          { amount: e.amount.toString(), creditDate: e.date, automatic: true },
        );
      }
    }
    const existing = new Set(credits.map((c) => c.invoiceId));
    for (const e of earned) {
      if (existing.has(e.invoiceId)) continue;
      const created = await tx.discountCredit.create({
        data: {
          partyId,
          invoiceId: e.invoiceId,
          amount: e.amount.toString(),
          creditDate: toDbDate(e.date),
        },
        select: { id: true },
      });
      await log('CREATE', created.id, null, {
        invoiceId: e.invoiceId,
        amount: e.amount.toString(),
        creditDate: e.date,
        automatic: true,
      });
    }
  }

  /** The party's credits, and unpaid invoices still within their discount window. */
  async forParty(partyId: string, db: Db = this.prisma): Promise<PartyDiscounts> {
    const [credits, offers] = await Promise.all([
      db.discountCredit.findMany({
        where: { partyId },
        orderBy: { creditDate: 'desc' },
        select: {
          id: true,
          amount: true,
          creditDate: true,
          status: true,
          reversedReason: true,
          reversedById: true,
          invoice: { select: { id: true, invoiceNo: true, invoiceDate: true } },
        },
      }),
      db.invoice.findMany({
        where: { partyId, deletedAt: null, promptDiscount: { gt: 0 }, discountCredit: null },
        orderBy: { invoiceDate: 'asc' },
        select: {
          id: true,
          invoiceNo: true,
          invoiceDate: true,
          promptDiscount: true,
          creditDays: true,
        },
      }),
    ]);
    const users = await db.user.findMany({
      where: { id: { in: credits.map((c) => c.reversedById).filter((u): u is string => !!u) } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return {
      credits: credits.map((c) => ({
        id: c.id,
        invoice: {
          id: c.invoice.id,
          invoiceNo: c.invoice.invoiceNo,
          invoiceDate: fromDbDate(c.invoice.invoiceDate),
        },
        amount: c.amount.toString(),
        creditDate: fromDbDate(c.creditDate),
        status: c.status,
        reversedReason: c.reversedReason,
        reversedBy: c.reversedById ? (names.get(c.reversedById) ?? 'Unknown') : null,
      })),
      eligible: offers.map((i) => ({
        invoiceId: i.id,
        invoiceNo: i.invoiceNo,
        invoiceDate: fromDbDate(i.invoiceDate),
        discount: i.promptDiscount.toString(),
        payBy: addDays(fromDbDate(i.invoiceDate), i.creditDays ?? 30),
      })),
    };
  }

  /** The office takes a credit back; it stays reversed (never re-credited). */
  async reverse(user: AuthUser, id: string, reason: string, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.discountCredit.findUnique({ where: { id } });
      if (!c) throw new NotFoundException('Discount not found.');
      if (c.status === 'REVERSED')
        throw new ConflictException('This discount is already reversed.');
      await tx.discountCredit.update({
        where: { id },
        data: { status: 'REVERSED', reversedReason: reason, reversedById: user.id },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'UPDATE',
          entity: 'DiscountCredit',
          entityId: id,
          before: { status: 'ACTIVE', amount: c.amount.toString() },
          after: { status: 'REVERSED', reason },
          ip,
        },
        tx,
      );
      // Later invoices may now need the full amount.
      await this.reconcile(tx, c.partyId, user.id, ip);
      return this.forParty(c.partyId, tx);
    });
  }
}
