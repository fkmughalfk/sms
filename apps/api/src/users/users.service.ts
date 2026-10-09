import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AuthUser,
  canManageRole,
  type CreateUserInput,
  type Paginated,
  type Role,
  type UpdateUserInput,
  type User,
  type UserListQuery,
} from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  salespersonId: true,
  salesperson: { select: { id: true, name: true } },
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const toUser = (u: UserRecord): User => ({
  ...u,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

const SORTABLE = ['name', 'email', 'role', 'createdAt', 'lastLoginAt'] as const;

const LAST_SUPER_ADMIN = 'There must always be at least one active Super Admin.';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async list(query: UserListQuery): Promise<Paginated<User>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [field, dir] = (query.sort ?? 'name:asc').split(':') as [string, 'asc' | 'desc'];
    const orderBy = (SORTABLE as readonly string[]).includes(field)
      ? { [field]: dir }
      : { name: 'asc' as const };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data: rows.map(toUser), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('User not found.');
    return toUser(user);
  }

  async create(actor: AuthUser, input: CreateUserInput, ip: string | null): Promise<User> {
    this.assertCanManage(actor, input.role);
    const passwordHash = await this.passwords.hash(input.password);
    return this.withEmailConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            role: input.role,
            salespersonId: input.salespersonId,
            passwordHash,
          },
          select: userSelect,
        });
        const user = toUser(created);
        await this.audit.log(
          {
            userId: actor.id,
            action: 'CREATE',
            entity: 'User',
            entityId: user.id,
            after: user,
            ip,
          },
          tx,
        );
        return user;
      }),
    );
  }

  async update(
    actor: AuthUser,
    id: string,
    input: UpdateUserInput,
    ip: string | null,
  ): Promise<User> {
    const target = await this.findForManage(actor, id);
    if (input.role && input.role !== target.role) {
      this.assertCanManage(actor, input.role);
    }

    return this.withEmailConflict(() =>
      this.prisma.$transaction(async (tx) => {
        if (
          target.role === 'SUPER_ADMIN' &&
          input.role &&
          input.role !== 'SUPER_ADMIN' &&
          target.isActive
        ) {
          await this.assertAnotherActiveSuperAdmin(tx, id);
        }
        const updated = await tx.user.update({ where: { id }, data: input, select: userSelect });
        const after = toUser(updated);
        await this.audit.log(
          {
            userId: actor.id,
            action: 'UPDATE',
            entity: 'User',
            entityId: id,
            before: toUser(target),
            after,
            ip,
          },
          tx,
        );
        return after;
      }),
    );
  }

  async setStatus(
    actor: AuthUser,
    id: string,
    isActive: boolean,
    ip: string | null,
  ): Promise<User> {
    const target = await this.findForManage(actor, id);
    if (!isActive && target.id === actor.id) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      if (!isActive && target.role === 'SUPER_ADMIN' && target.isActive) {
        await this.assertAnotherActiveSuperAdmin(tx, id);
      }
      const updated = await tx.user.update({
        where: { id },
        data: { isActive },
        select: userSelect,
      });
      const after = toUser(updated);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'User',
          entityId: id,
          before: toUser(target),
          after,
          ip,
        },
        tx,
      );
      return after;
    });
    // Spec §5.1: deactivating a user revokes their tokens.
    if (!isActive) await this.tokens.revokeAllForUser(id);
    return user;
  }

  async resetPassword(
    actor: AuthUser,
    id: string,
    newPassword: string,
    ip: string | null,
  ): Promise<void> {
    await this.findForManage(actor, id);
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'User',
          entityId: id,
          after: { passwordReset: true },
          ip,
        },
        tx,
      );
    });
    await this.tokens.revokeAllForUser(id);
  }

  /** Loads the target and checks the actor may manage someone with that role. */
  private async findForManage(actor: AuthUser, id: string): Promise<UserRecord> {
    const target = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!target) throw new NotFoundException('User not found.');
    this.assertCanManage(actor, target.role);
    return target;
  }

  private assertCanManage(actor: AuthUser, role: Role): void {
    if (!canManageRole(actor.role, role)) {
      throw new ForbiddenException(
        actor.role === 'ADMIN'
          ? 'Admins can only manage users with the User role.'
          : 'You cannot manage users.',
      );
    }
  }

  private async assertAnotherActiveSuperAdmin(
    tx: Prisma.TransactionClient,
    exceptId: string,
  ): Promise<void> {
    const others = await tx.user.count({
      where: { role: 'SUPER_ADMIN', isActive: true, id: { not: exceptId } },
    });
    if (others === 0) throw new BadRequestException(LAST_SUPER_ADMIN);
  }

  private async withEmailConflict<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A user with this email already exists.');
      }
      throw e;
    }
  }
}
