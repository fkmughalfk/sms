import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health';

describe('healthResponseSchema', () => {
  it('accepts a valid health payload', () => {
    const payload = { status: 'ok', service: 'sms-api', timestamp: new Date().toISOString() };
    expect(healthResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects an unexpected status', () => {
    const result = healthResponseSchema.safeParse({
      status: 'down',
      service: 'sms-api',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
