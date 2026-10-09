import { API_PREFIX } from '@sms/shared';

/** JWT access token (15 min). */
export const ACCESS_COOKIE = 'sms_at';
/** Opaque refresh token `<id>.<secret>` (7 days, rotated). Only sent to /auth endpoints. */
export const REFRESH_COOKIE = 'sms_rt';
/** Non-secret "a session exists" flag the web proxy checks before rendering app pages. */
export const SESSION_COOKIE = 'sms_session';

export const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth`;

export interface AccessTokenPayload {
  sub: string;
  role: string;
}
