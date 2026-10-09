import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AuthUser,
  dec,
  type PaymentFilter,
  type PaymentInput,
  type PaymentList,
  type PaymentListQuery,
  type PaymentRow,
  type UpdatePaymentInput,
} from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import { paymentScope } from '../common/data-scope';
import { dateRangeWhere, fromDbDate, toDbDate } from '../common/db-date';
import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../masters/master.service';
import { PrismaService } from '../prisma/prisma.service';

const ref = { select: { id: true, name: true } } as const;

const paymentSelect = {
  id: true,
  paymentDate: true,
  partyId: true,
  party: ref,
  subPartyId: true,
  subParty: ref,
  slipNo: true,
  bankId: true,
  bank: ref,
  amount: true,
  remarks: true,
  createdById: true,
  createdAt: true,
} satisfies Prisma.PaymentSelect;

type PaymentRec = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: PaymentListQuery): Promise<PaymentList> {
    const where = this.where(user, query);
    const [rows, total, sums] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: paymentSelect,
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      data: await this.toRows(rows),
      meta: { page: query.page, pageSize: query.pageSize, total },
      totals: {
        payments: total,
        totalAmount: dec(sums._sum.amount?.toString() ?? 0).toString(),
      },
    };
  }

  async exportRows(user: AuthUser, filter: PaymentFilter): Promise<PaymentRow[]> {
    const rows = await this.prisma.payment.findMany({
      where: this.where(user, filter),
      select: paymentSelect,
      orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
      take: 100_000,
    });
    return this.toRows(rows);
  }

  async get(user: AuthUser, id: string): Promise<PaymentRow> {
    const row = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null, ...paymentScope(user) },
      select: paymentSelect,
    });
    if (!row) throw new NotFoundException('Payment not found.');
    return (await this.toRows([row]))[0]!;
  }

  // ── Writes (transaction + audit — CLAUDE.md rule 7) ──

  async create(user: AuthUser, input: PaymentInput, ip: string | null): Promise<PaymentRow> {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.assertRefs(tx, input);
      const created = await tx.payment.create({
        data: { ...this.data(input), createdById: user.id },
        select: paymentSelect,
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'CREATE',
          entity: 'Payment',
          entityId: created.id,
          after: this.auditView(created),
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
    input: UpdatePaymentInput,
    ip: string | null,
  ): Promise<PaymentRow> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findFirst({
        where: { id, deletedAt: null },
        select: paymentSelect,
      });
      if (!existing) throw new NotFoundException('Payment not found.');

      const merged: PaymentInput = {
        paymentDate: input.paymentDate ?? fromDbDate(existing.paymentDate),
        partyId: input.partyId ?? existing.partyId,
        subPartyId: input.subPartyId !== undefined ? input.subPartyId : existing.subPartyId,
        slipNo: input.slipNo !== undefined ? input.slipNo : existing.slipNo,
        bankId: input.bankId !== undefined ? input.bankId : existing.bankId,
        amount: input.amount ?? existing.amount.toString(),
        remarks: input.remarks !== undefined ? input.remarks : existing.remarks,
      };
      await this.assertRefs(tx, merged, existing);
      const updated = await tx.payment.update({
        where: { id },
        data: { ...this.data(merged), updatedById: user.id },
        select: paymentSelect,
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'UPDATE',
          entity: 'Payment',
          entityId: id,
          before: this.auditView(existing),
          after: this.auditView(updated),
          ip,
        },
        tx,
      );
    });
    return this.get(user, id);
  }

  /** Soft delete (CLAUDE.md rule 6). */
  async remove(user: AuthUser, id: string, ip: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findFirst({
        where: { id, deletedAt: null },
        select: paymentSelect,
      });
      if (!existing) throw new NotFoundException('Payment not found.');
      await tx.payment.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: user.id },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'DELETE',
          entity: 'Payment',
          entityId: id,
          before: this.auditView(existing),
          ip,
        },
        tx,
      );
    });
  }

  // ── Internals ──

  /**
   * Party, sub-party and bank must exist and be active — unless the payment being
   * edited already used that (now inactive) record. A sub-party must belong to the
   * party or be unassigned (same rule as invoices, spec §5.2).
   */
  private async assertRefs(db: Db, input: PaymentInput, existing?: PaymentRec) {
    const fail = (path: string, message: string): never => {
      throw new BadRequestException({ message, errors: [{ path, message }] });
    };
    const active = { select: { isActive: true } } as const;

    const party = await db.party.findUnique({ where: { id: input.partyId }, ...active });
    if (!party || (!party.isActive && input.partyId !== existing?.partyId)) {
      fail('partyId', 'Select a party.');
    }
    if (input.bankId) {
      const bank = await db.bank.findUnique({ where: { id: input.bankId }, ...active });
      if (!bank || (!bank.isActive && input.bankId !== existing?.bankId)) {
        fail('bankId', 'Select an active bank.');
      }
    }
    if (input.subPartyId) {
      const sub = await db.subParty.findUnique({
        where: { id: input.subPartyId },
        select: { isActive: true, partyId: true },
      });
      if (
        !sub ||
        (!sub.isActive && input.subPartyId !== existing?.subPartyId) ||
        (sub.partyId !== null && sub.partyId !== input.partyId)
      ) {
        fail('subPartyId', 'Select a sub-party of this party.');
      }
    }
  }

  private data(input: PaymentInput) {
    return {
      paymentDate: toDbDate(input.paymentDate),
      partyId: input.partyId,
      subPartyId: input.subPartyId,
      slipNo: input.slipNo,
      bankId: input.bankId,
      amount: input.amount,
      remarks: input.remarks,
    };
  }

  private where(user: AuthUser, f: PaymentFilter): Prisma.PaymentWhereInput {
    const paymentDate = dateRangeWhere(f);
    return {
      deletedAt: null,
      ...paymentScope(user),
      ...(paymentDate ? { paymentDate } : {}),
      ...(f.partyId ? { partyId: f.partyId } : {}),
      ...(f.bankId ? { bankId: f.bankId } : {}),
      ...(f.search
        ? {
            OR: [
              { slipNo: { contains: f.search, mode: 'insensitive' as const } },
              { remarks: { contains: f.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  private async toRows(rows: PaymentRec[]): Promise<PaymentRow[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } },
      select: { id: true, name: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      id: r.id,
      paymentDate: fromDbDate(r.paymentDate),
      party: r.party,
      subParty: r.subParty,
      slipNo: r.slipNo,
      bank: r.bank,
      amount: r.amount.toString(),
      remarks: r.remarks,
      createdBy: byId.get(r.createdById) ?? { id: r.createdById, name: 'Unknown' },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private auditView(r: PaymentRec) {
    return {
      paymentDate: fromDbDate(r.paymentDate),
      partyId: r.partyId,
      subPartyId: r.subPartyId,
      slipNo: r.slipNo,
      bankId: r.bankId,
      amount: r.amount.toString(),
      remarks: r.remarks,
    };
  }
}
