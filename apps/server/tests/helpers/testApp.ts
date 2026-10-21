import { pino } from 'pino';
import { createApp } from '../../src/app.js';
import { parseEnv, type Env } from '../../src/config/env.js';
import { createMemoryRefreshTokenRepo, createMemoryUserRepo } from './memoryRepos.js';

export const TEST_SECRET = 'test-secret-test-secret-test-secret-123';

/** A clock tests can move forward, to check lockouts and expiry without waiting. */
export function createClock(start = new Date('2026-01-01T00:00:00Z')) {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advanceMs: (ms: number) => {
      current += ms;
    },
  };
}

export function buildTestApp(envOverrides: Record<string, string> = {}, ready = true) {
  const env: Env = parseEnv({
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://unused',
    JWT_ACCESS_SECRET: TEST_SECRET,
    LOG_LEVEL: 'silent',
    // High enough that ordinary tests never hit the limiter; the rate-limit test lowers it.
    AUTH_RATE_LIMIT_MAX: '1000',
    API_RATE_LIMIT_MAX: '1000',
    ...envOverrides,
  });
  const repos = {
    users: createMemoryUserRepo(),
    refreshTokens: createMemoryRefreshTokenRepo(),
  };
  const clock = createClock();
  const app = createApp({
    env,
    logger: pino({ level: 'silent' }),
    ...repos,
    isReady: async () => ready,
    now: clock.now,
  });
  return { app, env, clock, ...repos };
}

export const validRegistration = (n = 1) => ({
  email: `player${n}@example.com`,
  password: 'correct horse battery',
  displayName: `Player ${n}`,
});
