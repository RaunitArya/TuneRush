import { randomUUID } from 'node:crypto';
import type { AuthResponse, GuestInput, LoginInput, RegisterInput } from '@tunerush/shared';
import type { Env } from '../../config/env.js';
import { unauthorized } from '../../lib/errors.js';
import { emptyStats, type UserRepo } from '../users/user.repo.js';
import { toSelfUser } from '../users/user.mapper.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password.js';
import type { RefreshTokenRepo } from './refreshToken.repo.js';
import { generateRefreshToken, hashToken, signAccessToken, signGuestToken } from './tokens.js';

export interface AuthServiceDeps {
  env: Env;
  users: UserRepo;
  refreshTokens: RefreshTokenRepo;
  now?: () => Date;
}

export interface AuthResult extends AuthResponse {
  refreshToken: string;
  refreshExpiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const INVALID_CREDENTIALS = () => unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');

export function createAuthService({
  env,
  users,
  refreshTokens,
  now = () => new Date(),
}: AuthServiceDeps) {
  const accessConfig = { secret: env.JWT_ACCESS_SECRET, ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS };

  async function issueSession(
    user: Awaited<ReturnType<UserRepo['findByUid']>> & object,
    familyId: string,
  ): Promise<AuthResult> {
    const token = generateRefreshToken();
    const refreshExpiresAt = new Date(now().getTime() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    await refreshTokens.create({
      tokenHash: token.hash,
      userUid: user.uid,
      familyId,
      expiresAt: refreshExpiresAt,
    });
    return {
      accessToken: signAccessToken(user.uid, accessConfig),
      refreshToken: token.raw,
      refreshExpiresAt,
      user: toSelfUser(user),
    };
  }

  return {
    async register(input: RegisterInput): Promise<AuthResult> {
      const user = await users.create({
        uid: randomUUID(),
        email: input.email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
      });
      return issueSession(user, randomUUID());
    },

    async login(input: LoginInput): Promise<AuthResult> {
      const user = await users.findByEmail(input.email);
      if (!user) {
        await verifyAgainstDummy(input.password);
        throw INVALID_CREDENTIALS();
      }

      // A locked account gets the same generic error, so the response never confirms the email exists.
      if (user.lockedUntil && user.lockedUntil > now()) {
        await verifyAgainstDummy(input.password);
        throw INVALID_CREDENTIALS();
      }

      if (!(await verifyPassword(user.passwordHash, input.password))) {
        const lockUntil = new Date(now().getTime() + env.LOCKOUT_MINUTES * 60 * 1000);
        await users.recordLoginFailure(user.uid, env.LOGIN_MAX_FAILURES, lockUntil);
        throw INVALID_CREDENTIALS();
      }

      if (user.failedLogins > 0 || user.lockedUntil) await users.resetLoginFailures(user.uid);
      return issueSession(user, randomUUID());
    },

    /** Rotates the refresh token: the presented one is revoked and a new one is issued. */
    async refresh(rawToken: string | undefined): Promise<AuthResult> {
      if (!rawToken) throw unauthorized('NO_REFRESH_TOKEN', 'Missing refresh token');

      const record = await refreshTokens.findByHash(hashToken(rawToken));
      if (!record) throw unauthorized('INVALID_REFRESH_TOKEN', 'Invalid refresh token');

      // An already-revoked token being used again means it was copied: kill the whole family.
      if (record.revokedAt) {
        await refreshTokens.revokeFamily(record.familyId, now());
        throw unauthorized('REFRESH_TOKEN_REUSED', 'Refresh token reuse detected');
      }
      if (record.expiresAt <= now()) {
        throw unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token expired');
      }

      const user = await users.findByUid(record.userUid);
      if (!user) throw unauthorized('INVALID_REFRESH_TOKEN', 'Invalid refresh token');

      const next = await issueSession(user, record.familyId);
      // Revoke the old token only if nobody else did first. Two requests racing with the same
      // token: exactly one wins; the loser is treated as reuse and the family is revoked.
      const won = await refreshTokens.revokeIfActive(
        record.tokenHash,
        hashToken(next.refreshToken),
        now(),
      );
      if (!won) {
        await refreshTokens.revokeFamily(record.familyId, now());
        throw unauthorized('REFRESH_TOKEN_REUSED', 'Refresh token reuse detected');
      }
      return next;
    },

    /** Always succeeds from the caller's point of view; logging out twice is harmless. */
    async logout(rawToken: string | undefined): Promise<void> {
      if (!rawToken) return;
      const record = await refreshTokens.findByHash(hashToken(rawToken));
      if (record) await refreshTokens.revokeFamily(record.familyId, now());
    },

    guest(input: GuestInput): AuthResponse {
      const uid = `g_${randomUUID()}`;
      const accessToken = signGuestToken(uid, input.displayName, {
        secret: env.JWT_ACCESS_SECRET,
        ttlSeconds: env.GUEST_TOKEN_TTL_SECONDS,
      });
      return {
        accessToken,
        user: {
          uid,
          email: null,
          displayName: input.displayName,
          avatar: null,
          isGuest: true,
          stats: emptyStats(),
        },
      };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
