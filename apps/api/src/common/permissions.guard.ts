import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission } from '@sms/shared';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from './decorators';
import type { RequestUser } from './request-user';

/** Enforces `@RequirePermission(...)` against the shared role matrix. Runs after JwtAuthGuard. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<Request & { user?: RequestUser }>().user;
    if (!user || !required.every((p) => hasPermission(user.role, p))) {
      throw new ForbiddenException('You do not have permission to do this.');
    }
    return true;
  }
}
