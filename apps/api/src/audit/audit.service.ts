import { Injectable } from '@nestjs/common';
import type { AuditAction, AuditQuery, AuditEntry as AuditRow, Paginated } from '@sms/shared';
import { toDbDate } from '../common/db-date';
import { byFields, orderBy, pageArgs } from '../common/sorting';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

type Db = Pick<PrismaService, 'auditLog'> | Prisma.TransactionClient;

const toJson = (v: unknown) =>
  v === undefined || v === null
    ? Prisma.DbNull
    : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass `tx` to write the entry inside the caller's transaction (CLAUDE.md rule 7). */
  async log(entry: AuditEntry, tx: Db = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        ip: entry.ip ?? null,
      },
    });
  }

  /** Newest first; `to` includes that whole day (Asia/Karachi dates, stored UTC). */
  async list(query: AuditQuery): Promise<Paginated<AuditRow>> {
    const dayAfter = (d: string) => new Date(toDbDate(d).getTime() + 86_400_000);
    const where: Prisma.AuditLogWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              // Karachi is UTC+5: a business day starts at 19:00 UTC the day before.
              ...(query.from
                ? { gte: new Date(toDbDate(query.from).getTime() - 5 * 3_600_000) }
                : {}),
              ...(query.to ? { lt: new Date(dayAfter(query.to).getTime() - 5 * 3_600_000) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: orderBy(query.sort, byFields('createdAt', 'action', 'entity'), 'createdAt:desc', [
          { createdAt: 'desc' },
          { id: 'asc' },
        ]),
        ...pageArgs(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))] },
      },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      data: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        user: r.userId ? (byId.get(r.userId) ?? null) : null,
        action: r.action as AuditAction,
        entity: r.entity,
        entityId: r.entityId,
        before: r.before ?? null,
        after: r.after ?? null,
        ip: r.ip,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }
}
