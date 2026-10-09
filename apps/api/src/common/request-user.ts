import type { AuthUser } from '@sms/shared';

/** What JwtAuthGuard attaches to `req.user` — loaded fresh from the DB on every request. */
export type RequestUser = AuthUser;
