import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/tokens.js';
import { buildTestApp, TEST_SECRET, validRegistration } from '../helpers/testApp.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function refreshCookieOf(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('no refresh cookie set');
  return cookie;
}
const cookieValue = (setCookie: string) => setCookie.split(';')[0]!;

async function register(app: ReturnType<typeof buildTestApp>['app'], n = 1) {
  return request(app).post('/api/v1/auth/register').send(validRegistration(n));
}

describe('POST /auth/register', () => {
  it('creates an account, returns an access token and sets an httpOnly refresh cookie', async () => {
    const { app } = buildTestApp();
    const res = await register(app);

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      email: 'player1@example.com',
      displayName: 'Player 1',
      isGuest: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

    const cookie = refreshCookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('marks the cookie Secure in production', async () => {
    const { app } = buildTestApp({ NODE_ENV: 'production' });
    expect(refreshCookieOf(await register(app))).toMatch(/Secure/i);
  });

  it('stores only a hash of the password', async () => {
    const { app, users } = buildTestApp();
    await register(app);
    const stored = await users.findByEmail('player1@example.com');
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored?.passwordHash).not.toContain('correct horse');
  });

  it('normalises the email (trim, lower case) so duplicates cannot hide behind capitals', async () => {
    const { app } = buildTestApp();
    await register(app);
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validRegistration(1), email: '  PLAYER1@Example.com ' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects invalid input with a 400 and field details', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'nope', password: 'short', displayName: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password', 'displayName']));
  });
});

describe('POST /auth/login', () => {
  it('logs in with the right password', async () => {
    const { app } = buildTestApp();
    await register(app);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'player1@example.com', password: 'correct horse battery' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const { app } = buildTestApp();
    await register(app);
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'player1@example.com', password: 'wrong password!' });
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong password!' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks the account after repeated failures, even for the right password, then unlocks', async () => {
    const { app, clock } = buildTestApp({ LOGIN_MAX_FAILURES: '3', LOCKOUT_MINUTES: '15' });
    await register(app);
    const login = (password: string) =>
      request(app).post('/api/v1/auth/login').send({ email: 'player1@example.com', password });

    for (let i = 0; i < 3; i++) expect((await login('wrong password!')).status).toBe(401);
    const locked = await login('correct horse battery');
    expect(locked.status).toBe(401);
    expect(locked.body.error.code).toBe('INVALID_CREDENTIALS'); // no hint that it is locked

    clock.advanceMs(16 * 60 * 1000);
    expect((await login('correct horse battery')).status).toBe(200);
  });

  it('a successful login resets the failure counter', async () => {
    const { app, users } = buildTestApp({ LOGIN_MAX_FAILURES: '3' });
    await register(app);
    const login = (password: string) =>
      request(app).post('/api/v1/auth/login').send({ email: 'player1@example.com', password });
    await login('wrong password!');
    await login('wrong password!');
    expect((await login('correct horse battery')).status).toBe(200);
    expect((await users.findByEmail('player1@example.com'))?.failedLogins).toBe(0);
  });
});

describe('refresh token rotation', () => {
  it('issues a new cookie and access token, and the old cookie stops working', async () => {
    const { app } = buildTestApp();
    const first = refreshCookieOf(await register(app));

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieValue(first));
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    const second = refreshCookieOf(refreshed);
    expect(cookieValue(second)).not.toBe(cookieValue(first));

    const reused = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieValue(first));
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('REFRESH_TOKEN_REUSED');
  });

  it('reuse of an old token revokes the whole family, including the newest token', async () => {
    const { app } = buildTestApp();
    const first = refreshCookieOf(await register(app));
    const second = refreshCookieOf(
      await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieValue(first)),
    );

    await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieValue(first)); // attacker replays the old one
    const legit = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieValue(second));
    expect(legit.status).toBe(401);
  });

  it('two simultaneous refreshes with the same token: exactly one wins', async () => {
    const { app } = buildTestApp();
    const first = refreshCookieOf(await register(app));
    const [a, b] = await Promise.all([
      request(app).post('/api/v1/auth/refresh').set('Cookie', cookieValue(first)),
      request(app).post('/api/v1/auth/refresh').set('Cookie', cookieValue(first)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('rejects a missing, unknown or expired refresh token', async () => {
    const { app, clock } = buildTestApp({ REFRESH_TOKEN_TTL_DAYS: '30' });
    const first = refreshCookieOf(await register(app));

    expect((await request(app).post('/api/v1/auth/refresh')).body.error.code).toBe(
      'NO_REFRESH_TOKEN',
    );
    expect(
      (await request(app).post('/api/v1/auth/refresh').set('Cookie', 'refresh_token=made-up'))
        .status,
    ).toBe(401);

    clock.advanceMs(31 * DAY_MS);
    const expired = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieValue(first));
    expect(expired.status).toBe(401);
  });

  it('refuses a cookie request that comes from a foreign origin, and allows our own', async () => {
    const { app } = buildTestApp({ CORS_ORIGINS: 'http://localhost:5173' });
    const first = refreshCookieOf(await register(app));

    const evil = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieValue(first))
      .set('Origin', 'https://evil.example');
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('BAD_ORIGIN');

    const ours = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieValue(first))
      .set('Origin', 'http://localhost:5173');
    expect(ours.status).toBe(200);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the refresh token and is safe to call twice', async () => {
    const { app } = buildTestApp();
    const cookie = cookieValue(refreshCookieOf(await register(app)));

    expect((await request(app).post('/api/v1/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post('/api/v1/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post('/api/v1/auth/logout')).status).toBe(204);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(
      401,
    );
  });
});

describe('guests', () => {
  it('issues a signed guest token that works for /auth/me but not for account routes', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/api/v1/auth/guest').send({ displayName: 'Sam' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ displayName: 'Sam', isGuest: true, email: null });
    expect(res.headers['set-cookie']).toBeUndefined(); // guests get no refresh token

    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    const me = await request(app).get('/api/v1/auth/me').set(auth);
    expect(me.status).toBe(200);
    expect(me.body.user.isGuest).toBe(true);

    const profile = await request(app).get('/api/v1/users/me').set(auth);
    expect(profile.status).toBe(403);
    expect(profile.body.error.code).toBe('GUESTS_NOT_ALLOWED');
  });

  it('gives every guest a different id', async () => {
    const { app } = buildTestApp();
    const a = await request(app).post('/api/v1/auth/guest').send({ displayName: 'Sam' });
    const b = await request(app).post('/api/v1/auth/guest').send({ displayName: 'Sam' });
    expect(a.body.user.uid).not.toBe(b.body.user.uid);
  });
});

describe('access token checks on a protected route (GET /auth/me)', () => {
  const me = (app: ReturnType<typeof buildTestApp>['app'], header?: string) => {
    const r = request(app).get('/api/v1/auth/me');
    return header ? r.set('Authorization', header) : r;
  };

  it('returns the current user for a valid token', async () => {
    const { app } = buildTestApp();
    const { body } = await register(app);
    const res = await me(app, `Bearer ${body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('player1@example.com');
  });

  it('rejects a missing header', async () => {
    expect((await me(buildTestApp().app)).body.error.code).toBe('NO_TOKEN');
  });

  it('rejects an expired token', async () => {
    const { app } = buildTestApp();
    const expired = signAccessToken('u1', { secret: TEST_SECRET, ttlSeconds: -5 });
    expect((await me(app, `Bearer ${expired}`)).body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = signAccessToken('u1', { secret: 'z'.repeat(40), ttlSeconds: 900 });
    const res = await me(buildTestApp().app, `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token whose payload was edited', async () => {
    const { app } = buildTestApp();
    const { body } = await register(app);
    const [h, , s] = (body.accessToken as string).split('.');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'someone-else', kind: 'access', iss: 'tunerush' }),
    ).toString('base64url');
    expect((await me(app, `Bearer ${h}.${payload}.${s}`)).status).toBe(401);
  });

  it('rejects a token for an account that no longer exists', async () => {
    const ghost = jwt.sign({ kind: 'access' }, TEST_SECRET, {
      subject: 'deleted-user',
      issuer: 'tunerush',
      expiresIn: 60,
    });
    expect((await me(buildTestApp().app, `Bearer ${ghost}`)).status).toBe(401);
  });
});
