import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';
import { durationToMs, Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACCESS_COOKIE,
  AccessTokenPayload,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  SESSION_COOKIE,
} from './auth.constants';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Issues, rotates and revokes tokens, and writes them as httpOnly cookies (spec §1.1, §12). */
@Injectable()
export class TokenService {
  private readonly accessTtlMs: number;
  private readonly refreshTtlMs: number;
  private readonly secure: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtlMs = durationToMs(config.get('JWT_ACCESS_TTL', { infer: true }));
    this.refreshTtlMs = durationToMs(config.get('JWT_REFRESH_TTL', { infer: true }));
    this.secure = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  /** Creates a fresh access + refresh pair for `user` and sets the cookies. */
  async issue(res: Response, user: { id: string; role: string }): Promise<void> {
    const secret = randomBytes(32).toString('base64url');
    const token = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(secret),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: this.accessTtlMs / 1000 });
    this.setCookies(res, accessToken, `${token.id}.${secret}`);
  }

  /**
   * Validates a refresh cookie and revokes it (rotation). Returns the owning user id,
   * or null when the token is unknown, expired or already used. Re-use of a revoked
   * token revokes every session of that user (likely theft).
   */
  async consumeRefreshToken(raw: string | undefined): Promise<string | null> {
    const [id, secret] = raw?.split('.') ?? [];
    if (!id || !secret) return null;

    const token = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!token) return null;

    const expected = Buffer.from(token.tokenHash, 'hex');
    const actual = Buffer.from(sha256(secret), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    if (token.revokedAt) {
      await this.revokeAllForUser(token.userId);
      return null;
    }
    if (token.expiresAt <= new Date()) return null;

    // Conditional update so two concurrent refreshes can't both succeed.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count === 1 ? token.userId : null;
  }

  async revoke(raw: string | undefined): Promise<void> {
    const [id] = raw?.split('.') ?? [];
    if (!id) return;
    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      return null;
    }
  }

  clearCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, this.cookieOptions('/'));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions(REFRESH_COOKIE_PATH));
    res.clearCookie(SESSION_COOKIE, this.cookieOptions('/'));
  }

  private setCookies(res: Response, accessToken: string, refreshToken: string): void {
    res.cookie(ACCESS_COOKIE, accessToken, {
      ...this.cookieOptions('/'),
      maxAge: this.accessTtlMs,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(REFRESH_COOKIE_PATH),
      maxAge: this.refreshTtlMs,
    });
    res.cookie(SESSION_COOKIE, '1', { ...this.cookieOptions('/'), maxAge: this.refreshTtlMs });
  }

  private cookieOptions(path: string): CookieOptions {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax', path };
  }
}
