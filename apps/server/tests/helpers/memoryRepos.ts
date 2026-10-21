import { conflict } from '../../src/lib/errors.js';
import type {
  RefreshTokenRecord,
  RefreshTokenRepo,
} from '../../src/modules/auth/refreshToken.repo.js';
import { emptyStats, type UserRecord, type UserRepo } from '../../src/modules/users/user.repo.js';

/**
 * In-memory fakes of the repositories. Tests for routes and services use these, so they
 * run in milliseconds with no database. A contract test (tests/contract) runs the SAME checks
 * against these and against real MongoDB, which keeps the fakes honest.
 */

export function createMemoryUserRepo(): UserRepo {
  const users = new Map<string, UserRecord>();
  return {
    async create(input) {
      for (const u of users.values()) {
        if (u.email === input.email) throw conflict('EMAIL_TAKEN', 'Email is already registered');
      }
      const record: UserRecord = {
        ...input,
        avatar: null,
        stats: emptyStats(),
        failedLogins: 0,
        lockedUntil: null,
        createdAt: new Date(),
      };
      users.set(record.uid, record);
      return structuredClone(record);
    },
    async findByEmail(email) {
      for (const u of users.values()) if (u.email === email) return structuredClone(u);
      return null;
    },
    async findByUid(uid) {
      const u = users.get(uid);
      return u ? structuredClone(u) : null;
    },
    async updateProfile(uid, patch) {
      const u = users.get(uid);
      if (!u) return null;
      if (patch.displayName !== undefined) u.displayName = patch.displayName;
      if (patch.avatar !== undefined) u.avatar = patch.avatar;
      return structuredClone(u);
    },
    async recordLoginFailure(uid, maxFailures, lockUntil) {
      const u = users.get(uid);
      if (!u) return;
      u.failedLogins += 1;
      if (u.failedLogins >= maxFailures) {
        u.lockedUntil = lockUntil;
        u.failedLogins = 0;
      }
    },
    async resetLoginFailures(uid) {
      const u = users.get(uid);
      if (u) {
        u.failedLogins = 0;
        u.lockedUntil = null;
      }
    },
  };
}

export function createMemoryRefreshTokenRepo(): RefreshTokenRepo {
  const tokens = new Map<string, RefreshTokenRecord>();
  return {
    async create(record) {
      tokens.set(record.tokenHash, { ...record, revokedAt: null, replacedBy: null });
    },
    async findByHash(tokenHash) {
      const t = tokens.get(tokenHash);
      return t ? structuredClone(t) : null;
    },
    async revokeIfActive(tokenHash, replacedBy, now) {
      const t = tokens.get(tokenHash);
      if (!t || t.revokedAt) return false;
      t.revokedAt = now;
      t.replacedBy = replacedBy;
      return true;
    },
    async revokeFamily(familyId, now) {
      for (const t of tokens.values()) {
        if (t.familyId === familyId && !t.revokedAt) t.revokedAt = now;
      }
    },
  };
}
