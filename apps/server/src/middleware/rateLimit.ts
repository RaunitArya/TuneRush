import { rateLimit } from 'express-rate-limit';

function limiter(max: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' },
      });
    },
  });
}

export const createAuthLimiter = (max: number) => limiter(max, 15 * 60 * 1000);
export const createApiLimiter = (max: number) => limiter(max, 60 * 1000);
