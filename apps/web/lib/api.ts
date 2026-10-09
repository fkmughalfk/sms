import { API_PREFIX } from '@sms/shared';
import type { z } from 'zod';

/** Error shape returned by the API exception filter (spec §7). */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly errors?: { path: string; message: string }[],
    /** The full error body, for endpoint-specific fields (e.g. `code`, `invoiceId`). */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Called when the session is gone for good (refresh failed). Set by the auth provider. */
let onSessionExpired: (() => void) | undefined;
export function setSessionExpiredHandler(handler: (() => void) | undefined) {
  onSessionExpired = handler;
}

/** Endpoints where a 401 is a real answer, not an expired access token. */
const NO_REFRESH = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, shared by every request that hit a 401 concurrently. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`/${API_PREFIX}/auth/refresh`, {
    method: 'POST',
    credentials: 'same-origin',
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const send = (method: string, path: string, body?: unknown) =>
  fetch(`/${API_PREFIX}${path}`, {
    method,
    credentials: 'same-origin',
    // FormData (file uploads) sets its own multipart Content-Type.
    headers:
      body === undefined || body instanceof FormData
        ? undefined
        : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

/**
 * Calls the API through the same-origin `/api/*` rewrite so the httpOnly cookies are
 * sent. Never attaches tokens itself (CLAUDE.md rule 10). On 401 it refreshes the
 * session once and retries; a failed refresh clears the cookies server-side.
 */
async function sendWithRefresh(method: string, path: string, body?: unknown): Promise<Response> {
  let res = await send(method, path, body);
  if (res.status === 401 && !NO_REFRESH.has(path)) {
    if (await refreshSession()) {
      res = await send(method, path, body);
    }
    if (res.status === 401) onSessionExpired?.();
  }
  return res;
}

async function request<T>(
  method: string,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const res = await sendWithRefresh(method, path, body);

  const payload: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);

  if (!res.ok) {
    const err = (payload ?? {}) as { message?: string; errors?: ApiError['errors'] };
    throw new ApiError(res.status, err.message ?? res.statusText, err.errors, payload);
  }
  return schema.parse(payload);
}

/** Downloads a file endpoint (e.g. Excel export) with the session cookies. */
async function download(path: string, fallbackName: string): Promise<void> {
  const res = await sendWithRefresh('GET', path);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(res.status, err.message ?? res.statusText);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: name ?? fallbackName,
  });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  /** multipart/form-data POST (e.g. the Excel import). */
  upload: <T>(path: string, schema: z.ZodType<T>, form: FormData) =>
    request('POST', path, schema, form),
  download,
};
