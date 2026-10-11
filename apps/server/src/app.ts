import express from 'express';
import type { HealthResponse } from '@tunerush/shared';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', uptimeSeconds: process.uptime() };
    res.json(body);
  });

  return app;
}
