import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { HealthResponse } from '@tunerush/shared';
import type { Env } from './config/env.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createApiLimiter, createAuthLimiter } from './middleware/rateLimit.js';
import { createAuthRoutes } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import type { RefreshTokenRepo } from './modules/auth/refreshToken.repo.js';
import type { RoomRepo } from './modules/rooms/room.repo.js';
import { createRoomsRoutes } from './modules/rooms/rooms.routes.js';
import { createRoomsService } from './modules/rooms/rooms.service.js';
import type { UserRepo } from './modules/users/user.repo.js';
import { createUsersRoutes } from './modules/users/users.routes.js';

export interface AppDeps {
  env: Env;
  logger: Logger;
  users: UserRepo;
  refreshTokens: RefreshTokenRepo;
  rooms: RoomRepo;
  /** True when the database is reachable. Used by GET /ready. */
  isReady: () => Promise<boolean>;
  now?: () => Date;
}

export function createApp(deps: AppDeps) {
  const { env, logger, users, refreshTokens, rooms, isReady, now } = deps;
  const app = express();

  app.disable('x-powered-by');
  // Behind a proxy (Render, nginx) every request would otherwise appear to come from the proxy IP.
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', uptimeSeconds: process.uptime() };
    res.json(body);
  });
  app.get('/ready', async (_req, res) => {
    const ready = await isReady();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
  });

  const auth = createAuthService({ env, users, refreshTokens, ...(now ? { now } : {}) });
  const roomsService = createRoomsService({ rooms, users, ...(now ? { now } : {}) });

  const api = express.Router();
  api.use(createApiLimiter(env.API_RATE_LIMIT_MAX));
  api.use(
    '/auth',
    createAuthRoutes({ env, auth, users, authLimiter: createAuthLimiter(env.AUTH_RATE_LIMIT_MAX) }),
  );
  api.use('/users', createUsersRoutes({ env, users }));
  api.use('/rooms', createRoomsRoutes({ env, rooms: roomsService }));
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
