import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { API_PREFIX } from '@sms/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('GET /api/v1/health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get(`/${API_PREFIX}/health`).expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'sms-api' });
  });
});
