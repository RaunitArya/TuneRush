import type { Request, RequestHandler } from 'express';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyToken, type AuthContext } from '../modules/auth/tokens.js';

/** Verifies the Bearer access token and sets `req.auth`. The uid always comes from here. */
export function requireAuth(secret: string): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized('NO_TOKEN', 'Missing access token');
    }
    req.auth = verifyToken(header.slice('Bearer '.length), secret);
    next();
  };
}

/** Use after requireAuth on routes that need a real account (guests have no profile). */
export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.auth || req.auth.isGuest) {
    throw forbidden('GUESTS_NOT_ALLOWED', 'Create an account to use this feature');
  }
  next();
};

/** Reads the verified identity set by requireAuth. Throws if a route forgot to use it. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized('NO_TOKEN', 'Missing access token');
  return req.auth;
}
