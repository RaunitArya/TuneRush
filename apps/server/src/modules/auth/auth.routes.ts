import {
  Router,
  type CookieOptions,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { guestSchema, loginSchema, registerSchema } from '@tunerush/shared';
import type { Env } from '../../config/env.js';
import { forbidden } from '../../lib/errors.js';
import { getAuth, requireAuth } from '../../middleware/auth.js';
import { valid, validate } from '../../middleware/validate.js';
import { emptyStats, type UserRepo } from '../users/user.repo.js';
import { toSelfUser } from '../users/user.mapper.js';
import type { AuthResult, AuthService } from './auth.service.js';

export const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/v1/auth';

export function createAuthRoutes(opts: {
  env: Env;
  auth: AuthService;
  users: UserRepo;
  authLimiter: RequestHandler;
}) {
  const { env, auth, users, authLimiter: limiter } = opts;
  const router = Router();

  const cookieOptions = (): CookieOptions => ({
    httpOnly: true,
    // SameSite=None is only accepted by browsers together with Secure.
    secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    path: COOKIE_PATH,
  });

  function setSession(res: Response, result: AuthResult) {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...cookieOptions(),
      expires: result.refreshExpiresAt,
    });
    res.json({ accessToken: result.accessToken, user: result.user });
  }

  function assertTrustedOrigin(req: Request) {
    const origin = req.headers.origin;
    if (origin && !env.CORS_ORIGINS.includes(origin)) {
      throw forbidden('BAD_ORIGIN', 'Request origin is not allowed');
    }
  }

  router.post('/register', limiter, validate({ body: registerSchema }), async (_req, res) => {
    const body = valid(res, 'body', registerSchema);
    setSession(res.status(201), await auth.register(body));
  });

  router.post('/login', limiter, validate({ body: loginSchema }), async (_req, res) => {
    setSession(res, await auth.login(valid(res, 'body', loginSchema)));
  });

  router.post('/guest', limiter, validate({ body: guestSchema }), (_req, res) => {
    res.status(201).json(auth.guest(valid(res, 'body', guestSchema)));
  });

  router.post('/refresh', async (req, res) => {
    assertTrustedOrigin(req);
    try {
      setSession(res, await auth.refresh(req.cookies?.[REFRESH_COOKIE]));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions());
      throw err;
    }
  });

  router.post('/logout', async (req, res) => {
    assertTrustedOrigin(req);
    await auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    res.status(204).end();
  });

  router.get('/me', requireAuth(env.JWT_ACCESS_SECRET), async (req, res) => {
    const ctx = getAuth(req);
    if (ctx.isGuest) {
      res.json({
        user: {
          uid: ctx.uid,
          email: null,
          displayName: ctx.name ?? 'Guest',
          avatar: null,
          isGuest: true,
          stats: emptyStats(),
        },
      });
      return;
    }
    const user = await users.findByUid(ctx.uid);
    if (!user) {
      res
        .status(401)
        .json({ error: { code: 'INVALID_TOKEN', message: 'Account no longer exists' } });
      return;
    }
    res.json({ user: toSelfUser(user) });
  });

  return router;
}
