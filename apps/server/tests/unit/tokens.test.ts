import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
  signGuestToken,
  verifyToken,
} from '../../src/modules/auth/tokens.js';

const secret = 'a'.repeat(40);
const config = { secret, ttlSeconds: 900 };

describe('access tokens', () => {
  it('round-trips a user token', () => {
    const token = signAccessToken('u1', config);
    expect(verifyToken(token, secret)).toEqual({ uid: 'u1', isGuest: false });
  });

  it('round-trips a guest token with its name', () => {
    const token = signGuestToken('g_1', 'Sam', config);
    expect(verifyToken(token, secret)).toEqual({ uid: 'g_1', isGuest: true, name: 'Sam' });
  });

  it('rejects an expired token with TOKEN_EXPIRED', () => {
    const token = signAccessToken('u1', { secret, ttlSeconds: -10 });
    expect(() => verifyToken(token, secret)).toThrow(
      expect.objectContaining({ code: 'TOKEN_EXPIRED' }),
    );
  });

  it('rejects a token signed with another secret', () => {
    const token = signAccessToken('u1', { secret: 'b'.repeat(40), ttlSeconds: 900 });
    expect(() => verifyToken(token, secret)).toThrow(
      expect.objectContaining({ code: 'INVALID_TOKEN' }),
    );
  });

  it('rejects a tampered payload', () => {
    const [header, , signature] = signAccessToken('u1', config).split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'admin', kind: 'access', iss: 'tunerush' }),
    ).toString('base64url');
    expect(() => verifyToken(`${header}.${forgedPayload}.${signature}`, secret)).toThrow(
      expect.objectContaining({ code: 'INVALID_TOKEN' }),
    );
  });

  it('rejects an unsigned (alg none) token', () => {
    const none = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const token = `${none({ alg: 'none', typ: 'JWT' })}.${none({ sub: 'u1', kind: 'access', iss: 'tunerush' })}.`;
    expect(() => verifyToken(token, secret)).toThrow(
      expect.objectContaining({ code: 'INVALID_TOKEN' }),
    );
  });

  it('rejects a token from a different issuer', () => {
    const token = jwt.sign({ kind: 'access' }, secret, { subject: 'u1', issuer: 'someone-else' });
    expect(() => verifyToken(token, secret)).toThrow(
      expect.objectContaining({ code: 'INVALID_TOKEN' }),
    );
  });

  it('rejects garbage', () => {
    expect(() => verifyToken('not-a-jwt', secret)).toThrow(
      expect.objectContaining({ code: 'INVALID_TOKEN' }),
    );
  });
});

describe('refresh tokens', () => {
  it('generates unique random tokens whose hash is stable', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.raw.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a.raw)).toBe(a.hash);
    expect(a.hash).not.toBe(a.raw);
  });
});
