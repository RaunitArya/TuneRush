import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, validRegistration } from '../helpers/testApp.js';

async function signUp(app: ReturnType<typeof buildTestApp>['app'], n: number) {
  const res = await request(app).post('/api/v1/auth/register').send(validRegistration(n));
  return {
    uid: res.body.user.uid as string,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

describe('users', () => {
  it('requires a token on every route', async () => {
    const { app } = buildTestApp();
    expect((await request(app).get('/api/v1/users/me')).status).toBe(401);
    expect((await request(app).patch('/api/v1/users/me').send({ displayName: 'Hi' })).status).toBe(
      401,
    );
    expect((await request(app).get('/api/v1/users/anyone')).status).toBe(401);
  });

  it('GET /users/me returns the own profile', async () => {
    const { app } = buildTestApp();
    const { auth } = await signUp(app, 1);
    const res = await request(app).get('/api/v1/users/me').set(auth);
    expect(res.body.user).toMatchObject({ email: 'player1@example.com', displayName: 'Player 1' });
  });

  it('PATCH /users/me updates only the caller, even if the body names another uid', async () => {
    const { app } = buildTestApp();
    const alice = await signUp(app, 1);
    const bob = await signUp(app, 2);

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set(alice.auth)
      .send({ uid: bob.uid, displayName: 'Alice Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.user.uid).toBe(alice.uid);

    const bobNow = await request(app).get('/api/v1/users/me').set(bob.auth);
    expect(bobNow.body.user.displayName).toBe('Player 2');
  });

  it('rejects an empty update and a bad avatar url', async () => {
    const { app } = buildTestApp();
    const { auth } = await signUp(app, 1);
    expect((await request(app).patch('/api/v1/users/me').set(auth).send({})).status).toBe(400);
    expect(
      (
        await request(app)
          .patch('/api/v1/users/me')
          .set(auth)
          .send({ avatar: 'javascript:alert(1)' })
      ).status,
    ).toBe(400);
  });

  it('GET /users/:uid returns a public profile without the email', async () => {
    const { app } = buildTestApp();
    const alice = await signUp(app, 1);
    const bob = await signUp(app, 2);
    const res = await request(app).get(`/api/v1/users/${alice.uid}`).set(bob.auth);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ uid: alice.uid, displayName: 'Player 1' });
    expect(res.body.user).not.toHaveProperty('email');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|failedLogins|lockedUntil/);
  });

  it('returns 404 for an unknown uid', async () => {
    const { app } = buildTestApp();
    const { auth } = await signUp(app, 1);
    expect((await request(app).get('/api/v1/users/nope').set(auth)).status).toBe(404);
  });
});
