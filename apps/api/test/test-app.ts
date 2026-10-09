import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@sms/shared';
import * as argon2 from 'argon2';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/setup';

export const PASSWORD = 'Password123!';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaClient;
  /** Creates a user directly in the DB. */
  createUser(
    role: Role,
    email: string,
    opts?: { isActive?: boolean },
  ): Promise<{ id: string; email: string }>;
  /** A cookie-keeping agent signed in as `email` (each login uses its own client IP). */
  loginAs(email: string, password?: string): Promise<ReturnType<typeof request.agent>>;
  close(): Promise<void>;
}

let ipCounter = 1;
/** Distinct X-Forwarded-For per login so the 5/min login throttle doesn't trip unrelated tests. */
export const nextIp = () => `10.0.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;

/** Boots the real AppModule against an in-memory Postgres (PGlite) with all migrations applied. */
export async function createTestApp(): Promise<TestApp> {
  const pg = await PGlite.create({ extensions: { citext } });
  const migrationsDir = join(__dirname, '..', 'prisma', 'migrations');
  for (const dir of readdirSync(migrationsDir, { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  )) {
    await pg.exec(readFileSync(join(migrationsDir, dir.name, 'migration.sql'), 'utf8'));
  }
  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  await prisma.setting.create({ data: { id: 1 } });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, 'http://localhost:3000');
  await app.init();

  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });

  return {
    app,
    prisma,
    createUser: (role, email, opts) =>
      prisma.user.create({
        data: {
          name: `${role} ${email}`,
          email,
          role,
          passwordHash,
          isActive: opts?.isActive ?? true,
        },
        select: { id: true, email: true },
      }),
    async loginAs(email, password = PASSWORD) {
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', nextIp())
        .send({ email, password })
        .expect(200);
      return agent;
    },
    async close() {
      await app.close();
      await pg.close();
    },
  };
}
