import { healthResponseSchema } from '@sms/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

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
