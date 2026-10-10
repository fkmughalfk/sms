import type { Role } from '@sms/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app';

type Agent = ReturnType<typeof request.agent>;

describe('users & permission matrix (e2e)', () => {
  let t: TestApp;
  const ids: Record<string, string> = {};
  const as: Record<Role, Agent> = {} as Record<Role, Agent>;

  beforeAll(async () => {
    t = await createTestApp();
    ids.super = (await t.createUser('SUPER_ADMIN', 'super@waqar.pk')).id;
    ids.admin = (await t.createUser('ADMIN', 'admin@waqar.pk')).id;
    ids.user = (await t.createUser('USER', 'user@waqar.pk')).id;
    as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    as.ADMIN = await t.loginAs('admin@waqar.pk');
    as.USER = await t.loginAs('user@waqar.pk');
  });

  afterAll(() => t.close());

  let n = 0;
  const newUser = (role: Role) => ({
    name: `Test ${++n}`,
    email: `t${n}@waqar.pk`,
    password: 'Password123!',
    role,
  });

  describe('role → endpoint matrix (spec §3: "Create/edit/deactivate Users / Admins")', () => {
    it.each<[Role, number]>([
      ['SUPER_ADMIN', 200],
      ['ADMIN', 200],
      ['USER', 403],
    ])('GET /users as %s → %i', async (role, status) => {
      await as[role].get('/api/v1/users').expect(status);
    });

    it.each<[Role, Role, number]>([
      ['SUPER_ADMIN', 'SUPER_ADMIN', 201],
      ['SUPER_ADMIN', 'ADMIN', 201],
      ['SUPER_ADMIN', 'USER', 201],
      ['ADMIN', 'SUPER_ADMIN', 403],
      ['ADMIN', 'ADMIN', 403],
      ['ADMIN', 'USER', 201],
      ['USER', 'USER', 403],
    ])('POST /users as %s creating %s → %i', async (actor, role, status) => {
      await as[actor].post('/api/v1/users').send(newUser(role)).expect(status);
    });

    it.each<[Role, 'super' | 'admin' | 'user', number]>([
      ['SUPER_ADMIN', 'admin', 200],
      ['ADMIN', 'user', 200],
      ['ADMIN', 'admin', 403],
      ['ADMIN', 'super', 403],
      ['USER', 'user', 403],
    ])('PATCH /users/:id as %s on %s → %i', async (actor, target, status) => {
      await as[actor]
        .patch(`/api/v1/users/${ids[target]}`)
        .send({ name: 'Renamed' })
        .expect(status);
    });

    it('requests without a session get 401, not 403', async () => {
      await request(t.app.getHttpServer()).get('/api/v1/users').expect(401);
    });
  });

  describe('role assignment rules', () => {
    it('ADMIN cannot promote a USER to ADMIN or SUPER_ADMIN', async () => {
      const res = await as.ADMIN.patch(`/api/v1/users/${ids.user}`)
        .send({ role: 'ADMIN' })
        .expect(403);
      expect(res.body.message).toBe('Admins can only manage users with the User role.');
      await as.ADMIN.patch(`/api/v1/users/${ids.user}`).send({ role: 'SUPER_ADMIN' }).expect(403);
    });

    it('omitting role on PATCH leaves it unchanged', async () => {
      const res = await as.SUPER_ADMIN.patch(`/api/v1/users/${ids.admin}`)
        .send({ name: 'Office Admin' })
        .expect(200);
      expect(res.body).toMatchObject({ name: 'Office Admin', role: 'ADMIN' });
    });

    it('the last active SUPER_ADMIN cannot be demoted or deactivated', async () => {
      // Leave "super" as the only active SUPER_ADMIN.
      await t.prisma.user.updateMany({
        where: { role: 'SUPER_ADMIN', id: { not: ids.super } },
        data: { isActive: false },
      });
      const demote = await as.SUPER_ADMIN.patch(`/api/v1/users/${ids.super}`)
        .send({ role: 'ADMIN' })
        .expect(400);
      expect(demote.body.message).toBe('There must always be at least one active Super Admin.');

      // A second SUPER_ADMIN may deactivate "super"…
      const second = await t.createUser('SUPER_ADMIN', 'super2@waqar.pk');
      const secondAgent = await t.loginAs('super2@waqar.pk');
      await secondAgent
        .patch(`/api/v1/users/${ids.super}/status`)
        .send({ isActive: false })
        .expect(200);
      // …but is then the last one, so cannot demote itself.
      await secondAgent.patch(`/api/v1/users/${second.id}`).send({ role: 'ADMIN' }).expect(400);

      await t.prisma.user.update({ where: { id: ids.super }, data: { isActive: true } });
      as.SUPER_ADMIN = await t.loginAs('super@waqar.pk');
    });

    it('nobody can deactivate their own account', async () => {
      const res = await as.ADMIN.patch(`/api/v1/users/${ids.admin}/status`).send({
        isActive: false,
      });
      // ADMIN managing an ADMIN (itself) is already forbidden by the role rule.
      expect(res.status).toBe(403);
      const self = await as.SUPER_ADMIN.patch(`/api/v1/users/${ids.super}/status`).send({
        isActive: false,
      });
      expect(self.status).toBe(400);
      expect(self.body.message).toBe('You cannot deactivate your own account.');
    });
  });

  describe('lifecycle', () => {
    it('deactivating a user ends their session immediately and blocks login', async () => {
      const u = await t.createUser('USER', 'temp@waqar.pk');
      const agent = await t.loginAs('temp@waqar.pk');
      await agent.get('/api/v1/auth/me').expect(200);

      await as.ADMIN.patch(`/api/v1/users/${u.id}/status`).send({ isActive: false }).expect(200);

      await agent.get('/api/v1/auth/me').expect(401); // access token no longer accepted
      await agent.post('/api/v1/auth/refresh').expect(401); // refresh tokens revoked
    });

    it('reset password revokes sessions and the new password works', async () => {
      const u = await t.createUser('USER', 'reset@waqar.pk');
      const agent = await t.loginAs('reset@waqar.pk');
      await as.ADMIN.post(`/api/v1/users/${u.id}/reset-password`)
        .send({ newPassword: 'Fresh-pass-1' })
        .expect(204);
      await agent.post('/api/v1/auth/refresh').expect(401);
      await t.loginAs('reset@waqar.pk', 'Fresh-pass-1');
    });

    it('emails are unique case-insensitively', async () => {
      const res = await as.ADMIN.post('/api/v1/users')
        .send({ ...newUser('USER'), email: 'USER@Waqar.pk' })
        .expect(409);
      expect(res.body.message).toBe('A user with this email already exists.');
    });

    it('never returns password hashes, and writes audit entries', async () => {
      const res = await as.ADMIN.post('/api/v1/users').send(newUser('USER')).expect(201);
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
      const list = await as.ADMIN.get('/api/v1/users?search=waqar&pageSize=500').expect(200);
      expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|argon2/);
      const audit = await t.prisma.auditLog.findFirst({
        where: { entity: 'User', entityId: res.body.id },
      });
      expect(audit).toMatchObject({ action: 'CREATE', userId: ids.admin });
      expect(JSON.stringify(audit?.after)).not.toMatch(/passwordHash/);
    });

    it('lists with pagination meta and filters', async () => {
      const res = await as.SUPER_ADMIN.get('/api/v1/users?role=ADMIN&page=1&pageSize=2').expect(
        200,
      );
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2 });
      expect(res.body.data.every((u: { role: string }) => u.role === 'ADMIN')).toBe(true);
    });

    it('delete: only accounts with no activity; never yourself', async () => {
      const fresh = (await as.SUPER_ADMIN.post('/api/v1/users').send(newUser('USER')).expect(201))
        .body as { id: string };
      await as.USER.delete(`/api/v1/users/${fresh.id}`).expect(403);
      await as.ADMIN.delete(`/api/v1/users/${fresh.id}`).expect(204);
      await as.ADMIN.get(`/api/v1/users/${fresh.id}`).expect(404);

      // ADMIN cannot delete an admin; nobody deletes themselves.
      await as.ADMIN.delete(`/api/v1/users/${ids.super}`).expect(403);
      await as.SUPER_ADMIN.delete(`/api/v1/users/${ids.super}`).expect(400);

      // Logged in once → has history → deactivate instead.
      const res = await as.SUPER_ADMIN.delete(`/api/v1/users/${ids.user}`).expect(409);
      expect(res.body.message).toMatch(/logged action.*Deactivate it instead\.$/);
      expect(
        await t.prisma.auditLog.count({
          where: { entity: 'User', action: 'DELETE', entityId: fresh.id },
        }),
      ).toBe(1);
    });

    it('rejects an unknown salesperson link with 400', async () => {
      await as.ADMIN.post('/api/v1/users')
        .send({ ...newUser('USER'), salespersonId: 'does-not-exist' })
        .expect(400);
    });
  });
});
