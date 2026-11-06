import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AuthUser,
  dec,
  hasPermission,
  isScopedToOwnData,
  type PaymentInput,
  type SlipDetail,
  type SlipDetails,
  slipDetailsSchema,
  type SlipQuery,
  type SlipRow,
  type SlipStatus,
} from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import { fromDbDate, toDbDate } from '../common/db-date';
import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../masters/master.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';

/** Photos (jpeg, png, webp, heic) and PDFs. */
export const SLIP_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const select = {
  id: true,
  status: true,
  fileName: true,
  mimeType: true,
  partyId: true,
  details: true,
  paymentId: true,
  rejectReason: true,
  uploadedById: true,
  reviewedById: true,
  createdAt: true,
} as const;
type Rec = Prisma.PaymentSlipGetPayload<{ select: typeof select }>;

/** The payment a slip becomes; depositor and method go into the remarks. */
function toPayment(d: SlipDetails): PaymentInput {
  const extra = [d.depositor && `Depositor: ${d.depositor}`, d.method && d.method.toLowerCase()]
    .filter(Boolean)
    .join(' · ');
  return {
    paymentDate: d.paymentDate,
    partyId: d.partyId,
    subPartyId: d.subPartyId,
    slipNo: d.slipNo,
    bankId: d.bankId,
    amount: d.amount,
    remarks: [d.remarks, extra && `${extra} (slip)`].filter(Boolean).join(' · ') || null,
  };
}

/**
 * Payment slips (docs/ORDERS_DELIVERY_SPEC.md §5). The uploader picks the party and the
 * details are typed in — or, once an AI key is configured, read from the image first.
 * The office's slips become payments at once; a salesman's wait to be confirmed.
 */
@Injectable()
export class PaymentSlipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
  ) {}

  private canConfirm = (user: AuthUser) => hasPermission(user.role, 'payment.edit');

  /** A salesman sees the slips he uploaded; the office sees all. */
  private scope(user: AuthUser): Prisma.PaymentSlipWhereInput {
    return isScopedToOwnData(user.role) ? { uploadedById: user.id } : {};
  }

  /** Recorded payments this looks like: the same bank reference, or party + amount + date + bank. */
  async duplicates(db: Db, d: SlipDetails) {
    const or: Prisma.PaymentWhereInput[] = [
      {
        partyId: d.partyId,
        amount: d.amount,
        paymentDate: toDbDate(d.paymentDate),
        bankId: d.bankId ?? null,
      },
    ];
    if (d.slipNo) or.push({ slipNo: { equals: d.slipNo, mode: 'insensitive' } });
    const rows = await db.payment.findMany({
      where: { deletedAt: null, OR: or },
      select: {
        id: true,
        paymentDate: true,
        amount: true,
        slipNo: true,
        partyId: true,
        bankId: true,
        party: { select: { name: true } },
      },
      take: 5,
    });
    return rows.map((p) => ({
      paymentId: p.id,
      paymentDate: fromDbDate(p.paymentDate),
      amount: p.amount.toString(),
      slipNo: p.slipNo,
      party: p.party.name,
      why:
        d.slipNo && p.slipNo?.toLowerCase() === d.slipNo.toLowerCase()
          ? 'same bank reference'
          : 'same party, amount, date and bank',
    }));
  }

  async upload(
    user: AuthUser,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    details: SlipDetails,
    allowDuplicate: boolean,
    ip: string | null,
  ): Promise<SlipDetail> {
    if (!SLIP_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Upload a photo (JPG, PNG, WEBP, HEIC) or a PDF of the slip.');
    }
    const office = this.canConfirm(user);
    const id = await this.prisma.$transaction(async (tx) => {
      const dupes = await this.duplicates(tx, details);
      if (dupes.length && !allowDuplicate) {
        throw new ConflictException({
          message: `This looks like a payment already recorded (${dupes[0]!.why}).`,
          duplicates: dupes,
        });
      }
      const slip = await tx.paymentSlip.create({
        data: {
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileData: new Uint8Array(file.buffer),
          status: 'TO_CONFIRM',
          partyId: details.partyId,
          details: details as unknown as Prisma.InputJsonValue,
          uploadedById: user.id,
        },
        select: { id: true },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'CREATE',
          entity: 'PaymentSlip',
          entityId: slip.id,
          after: { fileName: file.originalname, ...details },
          ip,
        },
        tx,
      );
      if (office) await this.save(tx, user, slip.id, details, ip);
      return slip.id;
    });
    return this.get(user, id);
  }

  /** The office confirms a salesman's slip (details may be corrected); it becomes a payment. */
  async confirm(
    user: AuthUser,
    id: string,
    details: SlipDetails,
    allowDuplicate: boolean,
    ip: string | null,
  ): Promise<SlipDetail> {
    await this.prisma.$transaction(async (tx) => {
      const slip = await this.find(tx, user, id);
      if (slip.status !== 'TO_CONFIRM') {
        throw new ConflictException(
          `This slip is already ${slip.status === 'SAVED' ? 'saved' : 'rejected'}.`,
        );
      }
      const dupes = await this.duplicates(tx, details);
      if (dupes.length && !allowDuplicate) {
        throw new ConflictException({
          message: `This looks like a payment already recorded (${dupes[0]!.why}).`,
          duplicates: dupes,
        });
      }
      await this.save(tx, user, id, details, ip);
    });
    return this.get(user, id);
  }

  private async save(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    id: string,
    details: SlipDetails,
    ip: string | null,
  ) {
    const paymentId = await this.payments.createInTx(tx, user, toPayment(details), ip);
    await tx.paymentSlip.update({
      where: { id },
      data: {
        status: 'SAVED',
        paymentId,
        partyId: details.partyId,
        details: details as unknown as Prisma.InputJsonValue,
        reviewedById: user.id,
      },
    });
  }

  async reject(user: AuthUser, id: string, reason: string, ip: string | null): Promise<SlipDetail> {
    await this.prisma.$transaction(async (tx) => {
      const slip = await this.find(tx, user, id);
      if (slip.status !== 'TO_CONFIRM')
        throw new ConflictException('Only slips waiting to be confirmed can be rejected.');
      await tx.paymentSlip.update({
        where: { id },
        data: { status: 'REJECTED', rejectReason: reason, reviewedById: user.id },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'UPDATE',
          entity: 'PaymentSlip',
          entityId: id,
          after: { status: 'REJECTED', reason },
          ip,
        },
        tx,
      );
    });
    return this.get(user, id);
  }

  // ── Reads ──

  private async find(db: Db, user: AuthUser, id: string): Promise<Rec> {
    const slip = await db.paymentSlip.findFirst({
      where: { AND: [{ id }, this.scope(user)] },
      select,
    });
    if (!slip) throw new NotFoundException('Slip not found.');
    return slip;
  }

  private async refs(recs: Rec[], db: Db = this.prisma) {
    const ds = recs.map((r) => slipDetailsSchema.parse(r.details));
    const [parties, banks, users] = await Promise.all([
      db.party.findMany({
        where: { id: { in: recs.map((r) => r.partyId) } },
        select: { id: true, name: true },
      }),
      db.bank.findMany({
        where: { id: { in: ds.map((d) => d.bankId).filter((b): b is string => !!b) } },
        select: { id: true, name: true },
      }),
      db.user.findMany({
        where: {
          id: {
            in: recs
              .flatMap((r) => [r.uploadedById, r.reviewedById])
              .filter((u): u is string => !!u),
          },
        },
        select: { id: true, name: true },
      }),
    ]);
    const by = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    return { ds, parties: by(parties), banks: by(banks), users: by(users) };
  }

  private toRow(
    r: Rec,
    d: SlipDetails,
    refs: Awaited<ReturnType<PaymentSlipsService['refs']>>,
  ): SlipRow {
    const user = (id: string) => refs.users.get(id) ?? { id, name: 'Unknown' };
    return {
      id: r.id,
      status: r.status,
      fileName: r.fileName,
      mimeType: r.mimeType,
      party: refs.parties.get(r.partyId) ?? { id: r.partyId, name: 'Unknown' },
      paymentDate: d.paymentDate,
      amount: dec(d.amount).toString(),
      bank: d.bankId ? (refs.banks.get(d.bankId) ?? null) : null,
      slipNo: d.slipNo,
      depositor: d.depositor,
      paymentId: r.paymentId,
      rejectReason: r.rejectReason,
      uploadedBy: user(r.uploadedById),
      reviewedBy: r.reviewedById ? user(r.reviewedById) : null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async list(user: AuthUser, q: SlipQuery) {
    const where: Prisma.PaymentSlipWhereInput = {
      AND: [this.scope(user), q.status ? { status: q.status } : {}],
    };
    const [total, recs, grouped] = await Promise.all([
      this.prisma.paymentSlip.count({ where }),
      this.prisma.paymentSlip.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.paymentSlip.groupBy({
        by: ['status'],
        where: this.scope(user),
        _count: { _all: true },
      }),
    ]);
    const refs = await this.refs(recs);
    return {
      data: recs.map((r, i) => this.toRow(r, refs.ds[i]!, refs)),
      meta: { page: q.page, pageSize: q.pageSize, total },
      counts: Object.fromEntries(grouped.map((g) => [g.status as SlipStatus, g._count._all])),
    };
  }

  async get(user: AuthUser, id: string): Promise<SlipDetail> {
    const r = await this.find(this.prisma, user, id);
    const refs = await this.refs([r]);
    const d = refs.ds[0]!;
    return {
      ...this.toRow(r, d, refs),
      details: {
        paymentDate: d.paymentDate,
        partyId: d.partyId,
        subPartyId: d.subPartyId,
        slipNo: d.slipNo,
        bankId: d.bankId,
        amount: d.amount,
        remarks: d.remarks,
        depositor: d.depositor,
        method: d.method,
      },
      duplicates: r.status === 'TO_CONFIRM' ? await this.duplicates(this.prisma, d) : [],
    };
  }

  async file(user: AuthUser, id: string) {
    await this.find(this.prisma, user, id);
    const f = await this.prisma.paymentSlip.findUniqueOrThrow({
      where: { id },
      select: { fileName: true, mimeType: true, fileData: true },
    });
    return { name: f.fileName, type: f.mimeType, data: Buffer.from(f.fileData) };
  }
}
