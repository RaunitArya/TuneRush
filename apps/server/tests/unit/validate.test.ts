import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { z } from 'zod';
import { createErrorHandler } from '../../src/middleware/errorHandler.js';
import { valid, validate } from '../../src/middleware/validate.js';

const query = z.object({ page: z.coerce.number().int().min(1).default(1) });

function miniApp() {
  const app = express();
  app.use(express.json());
  app.get('/items', validate({ query }), (_req, res) => {
    res.json(valid(res, 'query', query));
  });
  app.get('/boom', () => {
    throw new Error('secret internal detail');
  });
  app.get('/async-boom', async () => {
    throw new Error('async secret');
  });
  app.use(createErrorHandler(pino({ level: 'silent' })));
  return app;
}

describe('validate middleware (Express 5 read-only req.query)', () => {
  it('returns parsed and coerced query values', async () => {
    const res = await request(miniApp()).get('/items?page=3');
    expect(res.body).toEqual({ page: 3 });
  });

  it('applies defaults', async () => {
    expect((await request(miniApp()).get('/items')).body).toEqual({ page: 1 });
  });

  it('turns a validation failure into a 400 with details', async () => {
    const res = await request(miniApp()).get('/items?page=0');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('page');
  });
});

describe('error handler', () => {
  it('hides internal error messages behind a generic 500', async () => {
    const res = await request(miniApp()).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  });

  it('catches errors thrown inside async handlers (Express 5, no try/catch needed)', async () => {
    const res = await request(miniApp()).get('/async-boom');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('async secret');
  });
});
