import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@tunerush/shared';
import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('returns ok and matches the shared schema', async () => {
    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });
});
