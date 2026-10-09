import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

describe('GET /api/v1/health (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  it('responds 200 with status ok, without a session', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'sms-api' });
  });
});
