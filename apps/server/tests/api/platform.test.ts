import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../helpers/testApp.js';

describe('platform behaviour', () => {
  it('answers unknown routes with a JSON 404', async () => {
    const res = await request(buildTestApp().app).get('/api/v1/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('answers malformed JSON with a 400 instead of a stack trace', async () => {
    const res = await request(buildTestApp().app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|at /);
  });

  it('rejects oversized bodies', async () => {
    const res = await request(buildTestApp().app)
      .post('/api/v1/auth/guest')
      .send({ displayName: 'x'.repeat(20_000) });
    expect(res.status).toBe(413);
  });

  it('sends security headers and hides the framework', async () => {
    const res = await request(buildTestApp().app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows configured CORS origins only, with credentials', async () => {
    const { app } = buildTestApp({ CORS_ORIGINS: 'http://localhost:5173' });
    const ok = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const bad = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('returns 429 after too many auth attempts', async () => {
    const { app } = buildTestApp({ AUTH_RATE_LIMIT_MAX: '3' });
    const attempt = () =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'a@example.com', password: 'whatever1' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('counts per client IP using X-Forwarded-For when trust proxy is set', async () => {
    const { app } = buildTestApp({ AUTH_RATE_LIMIT_MAX: '2', TRUST_PROXY: '1' });
    const attempt = (ip: string) =>
      request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'a@example.com', password: 'whatever1' });
    await attempt('1.1.1.1');
    await attempt('1.1.1.1');
    expect((await attempt('1.1.1.1')).status).toBe(429);
    expect((await attempt('2.2.2.2')).status).toBe(401); // a different client is not punished
  });
});
