import { healthResponseSchema } from '@sms/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setSessionExpiredHandler } from './api';

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('calls the same-origin /api/v1 path and parses the response', async () => {
    const body = { status: 'ok', service: 'sms-api', timestamp: new Date().toISOString() };
    const fetchMock = mockFetch(200, body);

    await expect(api.get('/health', healthResponseSchema)).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
  });

  it('throws ApiError with the server message on failure', async () => {
    mockFetch(403, { statusCode: 403, message: 'Forbidden resource' });

    const promise = api.get('/health', healthResponseSchema);
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ statusCode: 403, message: 'Forbidden resource' });
  });
});

describe('api client — session refresh', () => {
  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const okBody = { status: 'ok', service: 'sms-api', timestamp: new Date().toISOString() };

  afterEach(() => setSessionExpiredHandler(undefined));

  it('on 401, refreshes once and retries the request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { statusCode: 401, message: 'Please sign in.' }))
      .mockResolvedValueOnce(json(200, okBody)) // POST /auth/refresh
      .mockResolvedValueOnce(json(200, okBody)); // retry
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/health', healthResponseSchema)).resolves.toEqual(okBody);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/v1/health',
      '/api/v1/auth/refresh',
      '/api/v1/health',
    ]);
  });

  it('shares one refresh between concurrent 401s', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/v1/auth/refresh') {
        refreshCalls++;
        return Promise.resolve(json(200, okBody));
      }
      // First call per request is 401, retries succeed.
      return Promise.resolve(refreshCalls === 0 ? json(401, {}) : json(200, okBody));
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      api.get('/health', healthResponseSchema),
      api.get('/health', healthResponseSchema),
    ]);
    expect(refreshCalls).toBe(1);
  });

  it('calls the session-expired handler when refresh fails', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(401, { statusCode: 401, message: 'Session expired.' })),
    );

    await expect(api.get('/users', healthResponseSchema)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('does not try to refresh after a failed login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json(401, { statusCode: 401, message: 'Invalid email or password.' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.post('/auth/login', healthResponseSchema, {})).rejects.toMatchObject({
      message: 'Invalid email or password.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
