import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { unauthorized } from '../../lib/errors.js';

const ISSUER = 'tunerush';

export interface AuthContext {
  uid: string;
  isGuest: boolean;
  /** Only set for guests: their name lives in the token because they have no database record. */
  name?: string;
}

export interface TokenConfig {
  secret: string;
  ttlSeconds: number;
}

export function signAccessToken(uid: string, config: TokenConfig): string {
  return jwt.sign({ kind: 'access' }, config.secret, {
    algorithm: 'HS256',
    issuer: ISSUER,
    subject: uid,
    expiresIn: config.ttlSeconds,
  });
}

export function signGuestToken(uid: string, name: string, config: TokenConfig): string {
  return jwt.sign({ kind: 'guest', name }, config.secret, {
    algorithm: 'HS256',
    issuer: ISSUER,
    subject: uid,
    expiresIn: config.ttlSeconds,
  });
}

export function verifyToken(token: string, secret: string): AuthContext {
  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER });
    if (typeof decoded === 'string') throw new Error('unexpected payload');
    payload = decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw unauthorized('TOKEN_EXPIRED', 'Access token expired');
    }
    throw unauthorized('INVALID_TOKEN', 'Invalid access token');
  }

  const { sub, kind, name } = payload;
  if (typeof sub !== 'string' || (kind !== 'access' && kind !== 'guest')) {
    throw unauthorized('INVALID_TOKEN', 'Invalid access token');
  }
  if (kind === 'guest') {
    return { uid: sub, isGuest: true, name: typeof name === 'string' ? name : 'Guest' };
  }
  return { uid: sub, isGuest: false };
}

/** 32 random bytes. The raw value goes to the client, only its hash goes to the database. */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

/**
 * SHA-256 is correct here (not argon2): the token already has 256 bits of randomness, so there
 * is nothing to brute force. Slow hashes are for low-entropy secrets such as passwords.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
