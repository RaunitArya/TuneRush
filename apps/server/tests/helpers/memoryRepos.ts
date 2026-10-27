import { conflict } from '../../src/lib/errors.js';
import type {
  RefreshTokenRecord,
  RefreshTokenRepo,
} from '../../src/modules/auth/refreshToken.repo.js';
import { emptyStats, type UserRecord, type UserRepo } from '../../src/modules/users/user.repo.js';
import type { RoomRecord, RoomRepo } from '../../src/modules/rooms/room.repo.js';

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

export function createMemoryRoomRepo(): RoomRepo {
  const rooms = new Map<string, RoomRecord>();
  return {
    async create(room) {
      if (rooms.has(room.code)) throw conflict('CODE_TAKEN', 'Room code already exists');
      rooms.set(room.code, structuredClone(room));
      return structuredClone(room);
    },
    async findByCode(code) {
      const r = rooms.get(code);
      return r ? structuredClone(r) : null;
    },
    async addPlayer(code, player, maxPlayers) {
      const r = rooms.get(code);
      if (!r || r.status !== 'lobby') return null;
      if (r.players.some((p) => p.uid === player.uid)) return null;
      if (r.players.length >= maxPlayers) return null;
      r.players.push(structuredClone(player));
      return structuredClone(r);
    },
    async removePlayer(code, uid) {
      const r = rooms.get(code);
      if (!r) return null;
      r.players = r.players.filter((p) => p.uid !== uid);
      return structuredClone(r);
    },
    async setHost(code, uid) {
      const r = rooms.get(code);
      if (r) r.hostUid = uid;
    },
    async updateSettings(code, hostUid, settings) {
      const r = rooms.get(code);
      if (!r || r.hostUid !== hostUid || r.status !== 'lobby') return null;
      for (const [key, value] of Object.entries(settings)) {
        if (value !== undefined) (r.settings as unknown as Record<string, unknown>)[key] = value;
      }
      return structuredClone(r);
    },
    async delete(code) {
      rooms.delete(code);
    },
  };
}
