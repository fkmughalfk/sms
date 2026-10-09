import request from 'supertest';
import { createTestApp, nextIp, PASSWORD, type TestApp } from './test-app';

const cookieHeader = (res: request.Response): string[] => {
  const raw = res.headers['set-cookie'] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
};
const cookie = (res: request.Response, name: string) =>
  cookieHeader(res).find((c) => c.startsWith(`${name}=`));

describe('auth (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.createUser('SUPER_ADMIN', 'boss@waqar.pk');
    await t.createUser('USER', 'clerk@waqar.pk');
    await t.createUser('USER', 'gone@waqar.pk', { isActive: false });
  });

  afterAll(() => t.close());

  const login = (email: string, password = PASSWORD) =>
    request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password });

  describe('POST /auth/login', () => {
    it('sets httpOnly SameSite=Lax cookies and returns the user (no tokens in the body)', async () => {
      const res = await login('Boss@Waqar.pk').expect(200);
      expect(res.body).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        email: 'boss@waqar.pk',
        role: 'SUPER_ADMIN',
        salespersonId: null,
      });
      for (const name of ['sms_at', 'sms_rt', 'sms_session']) {
        expect(cookie(res, name)).toMatch(/HttpOnly/);
        expect(cookie(res, name)).toMatch(/SameSite=Lax/);
      }
      expect(cookie(res, 'sms_rt')).toMatch(/Path=\/api\/v1\/auth/);
      expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    });

    it('records lastLoginAt and a LOGIN audit entry', async () => {
      await login('clerk@waqar.pk').expect(200);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'clerk@waqar.pk' } });
      expect(user.lastLoginAt).not.toBeNull();
      expect(
        await t.prisma.auditLog.count({ where: { action: 'LOGIN', userId: user.id } }),
      ).toBeGreaterThan(0);
    });

    it('rejects a wrong password, an unknown email and an inactive user with the same message', async () => {
      for (const res of [
        await login('boss@waqar.pk', 'wrong-password'),
        await login('nobody@waqar.pk'),
        await login('gone@waqar.pk'),
      ]) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ statusCode: 401, message: 'Invalid email or password.' });
      }
    });

    it('returns validation errors in the standard shape', async () => {
      const res = await login('not-an-email', '').expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        message: 'Enter a valid email.',
        errors: [
          { path: 'email', message: 'Enter a valid email.' },
          { path: 'password', message: 'Enter your password.' },
        ],
      });
    });

    it('allows 5 attempts per minute per IP, then 429', async () => {
      const ip = '203.0.113.7';
      const attempt = () =>
        request(t.app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', ip)
          .send({ email: 'boss@waqar.pk', password: 'wrong-password' });
      for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
      expect((await attempt()).status).toBe(429);
    });
  });

  describe('session', () => {
    it('GET /auth/me needs a session', async () => {
      await request(t.app.getHttpServer()).get('/api/v1/auth/me').expect(401);
      const agent = await t.loginAs('clerk@waqar.pk');
      const res = await agent.get('/api/v1/auth/me').expect(200);
      expect(res.body.email).toBe('clerk@waqar.pk');
    });

    it('rejects a forged access token', async () => {
      await request(t.app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', 'sms_at=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad')
        .expect(401);
    });

    it('refresh rotates the token; re-using the old one revokes every session', async () => {
      const first = await login('clerk@waqar.pk').expect(200);
      const oldRefresh = cookie(first, 'sms_rt')!.split(';')[0]!;

      const second = await request(t.app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldRefresh)
        .expect(200);
      const newRefresh = cookie(second, 'sms_rt')!.split(';')[0]!;
      expect(newRefresh).not.toBe(oldRefresh);

      // Replay of the rotated token → 401, and the newer token is revoked too.
      await request(t.app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldRefresh)
        .expect(401);
      await request(t.app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', newRefresh)
        .expect(401);
    });

    it('refresh without a cookie is 401 and clears cookies', async () => {
      const res = await request(t.app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);
      expect(cookie(res, 'sms_session')).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('logout revokes the refresh token and clears cookies', async () => {
      const agent = await t.loginAs('clerk@waqar.pk');
      const res = await agent.post('/api/v1/auth/logout').expect(204);
      expect(cookie(res, 'sms_at')).toMatch(/Expires=Thu, 01 Jan 1970/);
      await agent.post('/api/v1/auth/refresh').expect(401);
      await agent.get('/api/v1/auth/me').expect(401);
    });
  });

  describe('POST /auth/change-password', () => {
    it('checks the current password, then signs out other sessions', async () => {
      await t.createUser('USER', 'pw@waqar.pk');
      const other = await t.loginAs('pw@waqar.pk');
      const agent = await t.loginAs('pw@waqar.pk');

      await agent
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'nope', newPassword: 'NewPassword1!' })
        .expect(401);
      await agent
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'NewPassword1!' })
        .expect(204);

      await agent.get('/api/v1/auth/me').expect(200); // this session got fresh cookies
      await other.post('/api/v1/auth/refresh').expect(401); // other session revoked
      await login('pw@waqar.pk').expect(401);
      await login('pw@waqar.pk', 'NewPassword1!').expect(200);
    });
  });
});
