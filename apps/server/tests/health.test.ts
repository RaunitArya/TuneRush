import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@tunerush/shared';
import { buildTestApp } from './helpers/testApp.js';

describe('health endpoints', () => {
  it('GET /health matches the shared schema', async () => {
    const res = await request(buildTestApp().app).get('/health');

    expect(res.status).toBe(200);
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it('GET /ready is 200 when the database is reachable and 503 when it is not', async () => {
    expect((await request(buildTestApp({}, true).app).get('/ready')).status).toBe(200);
    expect((await request(buildTestApp({}, false).app).get('/ready')).status).toBe(503);
  });
});
