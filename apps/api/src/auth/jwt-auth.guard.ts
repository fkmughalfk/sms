import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators';
import type { RequestUser } from '../common/request-user';
import { ACCESS_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

/**
 * Global guard: reads the access token from its httpOnly cookie, then reloads the
 * user so deactivation and role changes take effect immediately. Opt out with @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const token = (req.cookies as Record<string, string | undefined> | undefined)?.[ACCESS_COOKIE];
    const payload = token ? await this.tokens.verifyAccessToken(token) : null;
    const user = payload ? await this.auth.findActiveUser(payload.sub) : null;
    if (!user) throw new UnauthorizedException('Please sign in.');

    req.user = user;
    return true;
  }
}
