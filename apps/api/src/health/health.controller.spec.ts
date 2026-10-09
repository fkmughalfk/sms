import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@sms/shared';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('returns a payload matching the shared health schema', () => {
    expect(healthResponseSchema.safeParse(controller.check()).success).toBe(true);
  });
});
