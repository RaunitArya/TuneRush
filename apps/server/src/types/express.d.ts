import type { AuthContext } from '../modules/auth/tokens.ts';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
