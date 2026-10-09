import { API_PREFIX } from '@sms/shared';
import type { z } from 'zod';

/** Error shape returned by the API exception filter (spec §7). */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly errors?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Calls the API through the same-origin `/api/*` rewrite so httpOnly cookies are sent.
 * Never attach tokens manually (CLAUDE.md rule 10).
 */
async function request<T>(
  method: string,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/${API_PREFIX}${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);

  if (!res.ok) {
    const err = (payload ?? {}) as { message?: string; errors?: unknown };
    throw new ApiError(res.status, err.message ?? res.statusText, err.errors);
  }
  return schema.parse(payload);
}

export const api = {
  get: <T>(path: string, schema: z.ZodType<T>) => request('GET', path, schema),
  post: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request('POST', path, schema, body),
  put: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request('PUT', path, schema, body),
  patch: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request('PATCH', path, schema, body),
  delete: <T>(path: string, schema: z.ZodType<T>) => request('DELETE', path, schema),
};
