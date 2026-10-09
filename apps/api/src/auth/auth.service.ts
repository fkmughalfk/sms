import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUser, ChangePasswordInput, LoginInput } from '@sms/shared';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export const authUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  salespersonId: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  findActiveUser(id: string): Promise<AuthUser | null> {
    return this.prisma.user.findFirst({ where: { id, isActive: true }, select: authUserSelect });
  }

  async login(input: LoginInput, ip: string | null, res: Response): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const valid = await this.passwords.verify(user?.passwordHash, input.password);
    // Same message for unknown email, wrong password and deactivated account.
    if (!user || !valid || !user.isActive)
      throw new UnauthorizedException('Invalid email or password.');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      ip,
    });
    await this.tokens.issue(res, user);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      salespersonId: user.salespersonId,
    };
  }

  async refresh(rawToken: string | undefined, res: Response): Promise<AuthUser> {
    const userId = await this.tokens.consumeRefreshToken(rawToken);
    const user = userId ? await this.findActiveUser(userId) : null;
    if (!user) {
      this.tokens.clearCookies(res);
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }
    await this.tokens.issue(res, user);
    return user;
  }

  async logout(rawToken: string | undefined, res: Response): Promise<void> {
    await this.tokens.revoke(rawToken);
    this.tokens.clearCookies(res);
  }

  /** Changes the password, signs out every other session and starts a fresh one. */
  async changePassword(
    user: AuthUser,
    input: ChangePasswordInput,
    ip: string | null,
    res: Response,
  ) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await this.passwords.verify(record.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwords.hash(input.newPassword) },
    });
    await this.tokens.revokeAllForUser(user.id);
    await this.audit.log({
      userId: user.id,
      action: 'UPDATE',
      entity: 'User',
      entityId: user.id,
      after: { passwordChanged: true },
      ip,
    });
    await this.tokens.issue(res, user);
  }
}
