import { beforeEach, describe, expect, it } from 'vitest';
import type { RefreshTokenRepo } from '../../src/modules/auth/refreshToken.repo.js';
import type { UserRepo } from '../../src/modules/users/user.repo.js';
import type { RoomRecord, RoomRepo } from '../../src/modules/rooms/room.repo.js';

export interface Repos {
  users: UserRepo;
  refreshTokens: RefreshTokenRepo;
  rooms: RoomRepo;
}

const newUser = (n: number) => ({
  uid: `u${n}`,
  email: `u${n}@example.com`,
  passwordHash: 'hash',
  displayName: `User ${n}`,
});

const room = (over: Partial<RoomRecord> = {}): RoomRecord => ({
  code: 'ABC234',
  hostUid: 'host',
  status: 'lobby',
  settings: { rounds: 10, durationSec: 30, language: 'any' },
  players: [{ uid: 'host', name: 'Host', avatar: null, score: 0, connected: true }],
  songIds: [],
  currentRound: 0,
  expiresAt: new Date('2030-01-01T00:00:00Z'),
  ...over,
});

const player = (uid: string) => ({ uid, name: uid, avatar: null, score: 0, connected: true });

/**
 * The same checks run against the in-memory fakes AND real MongoDB. If both pass, the fakes
 * used by the fast tests behave like the real database.
 * `makeRepos` must return EMPTY repositories every time it is called.
 */
export function describeRepoContract(name: string, makeRepos: () => Promise<Repos>) {
  describe(`repository contract: ${name}`, () => {
    let repos: Repos;
    beforeEach(async () => {
      repos = await makeRepos();
    });

    describe('users', () => {
      it('creates and finds by email and uid, with default stats', async () => {
        const created = await repos.users.create(newUser(1));
        expect(created).toMatchObject({
          uid: 'u1',
          avatar: null,
          failedLogins: 0,
          lockedUntil: null,
        });
        expect(created.stats.gamesPlayed).toBe(0);
        expect((await repos.users.findByEmail('u1@example.com'))?.uid).toBe('u1');
        expect((await repos.users.findByUid('u1'))?.email).toBe('u1@example.com');
        expect(await repos.users.findByUid('missing')).toBeNull();
      });

      it('rejects a duplicate email with EMAIL_TAKEN', async () => {
        await repos.users.create(newUser(1));
        await expect(
          repos.users.create({ ...newUser(2), email: 'u1@example.com' }),
        ).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_TAKEN' });
      });

      it('updates only the provided profile fields', async () => {
        await repos.users.create(newUser(1));
        const updated = await repos.users.updateProfile('u1', {
          avatar: 'https://example.com/a.png',
        });
        expect(updated).toMatchObject({
          displayName: 'User 1',
          avatar: 'https://example.com/a.png',
        });
        expect(await repos.users.updateProfile('missing', { displayName: 'X' })).toBeNull();
      });

      it('locks after the maximum number of failures and clears the counter', async () => {
        await repos.users.create(newUser(1));
        const until = new Date('2030-01-01T00:00:00Z');
        await repos.users.recordLoginFailure('u1', 3, until);
        await repos.users.recordLoginFailure('u1', 3, until);
        expect(await repos.users.findByUid('u1')).toMatchObject({
          failedLogins: 2,
          lockedUntil: null,
        });

        await repos.users.recordLoginFailure('u1', 3, until);
        const locked = await repos.users.findByUid('u1');
        expect(locked?.lockedUntil?.getTime()).toBe(until.getTime());
        expect(locked?.failedLogins).toBe(0);

        await repos.users.resetLoginFailures('u1');
        expect((await repos.users.findByUid('u1'))?.lockedUntil).toBeNull();
      });
    });

    describe('refresh tokens', () => {
      const record = (hash: string, family = 'fam1') => ({
        tokenHash: hash,
        userUid: 'u1',
        familyId: family,
        expiresAt: new Date('2030-01-01T00:00:00Z'),
      });

      it('stores a token as active and finds it by hash', async () => {
        await repos.refreshTokens.create(record('h1'));
        expect(await repos.refreshTokens.findByHash('h1')).toMatchObject({
          userUid: 'u1',
          revokedAt: null,
          replacedBy: null,
        });
        expect(await repos.refreshTokens.findByHash('nope')).toBeNull();
      });

      it('revokeIfActive succeeds once and then reports false', async () => {
        await repos.refreshTokens.create(record('h1'));
        const now = new Date('2026-01-01T00:00:00Z');
        expect(await repos.refreshTokens.revokeIfActive('h1', 'h2', now)).toBe(true);
        expect(await repos.refreshTokens.revokeIfActive('h1', 'h3', now)).toBe(false);
        expect(await repos.refreshTokens.revokeIfActive('missing', null, now)).toBe(false);
        expect(await repos.refreshTokens.findByHash('h1')).toMatchObject({ replacedBy: 'h2' });
      });

      it('revokeIfActive is atomic: of many simultaneous calls exactly one wins', async () => {
        await repos.refreshTokens.create(record('h1'));
        const now = new Date('2026-01-01T00:00:00Z');
        const results = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            repos.refreshTokens.revokeIfActive('h1', `n${i}`, now),
          ),
        );
        expect(results.filter(Boolean)).toHaveLength(1);
      });

      it('revokeFamily revokes every token in the family and no others', async () => {
        await repos.refreshTokens.create(record('a', 'fam1'));
        await repos.refreshTokens.create(record('b', 'fam1'));
        await repos.refreshTokens.create(record('c', 'fam2'));
        await repos.refreshTokens.revokeFamily('fam1', new Date('2026-01-01T00:00:00Z'));
        expect((await repos.refreshTokens.findByHash('a'))?.revokedAt).not.toBeNull();
        expect((await repos.refreshTokens.findByHash('b'))?.revokedAt).not.toBeNull();
        expect((await repos.refreshTokens.findByHash('c'))?.revokedAt).toBeNull();
      });
    });

    describe('rooms', () => {
      it('creates and finds a room; a duplicate code is CODE_TAKEN', async () => {
        await repos.rooms.create(room());
        expect((await repos.rooms.findByCode('ABC234'))?.hostUid).toBe('host');
        expect(await repos.rooms.findByCode('ZZZZZZ')).toBeNull();
        await expect(repos.rooms.create(room())).rejects.toMatchObject({
          statusCode: 409,
          code: 'CODE_TAKEN',
        });
      });

      it('addPlayer adds a new player in the lobby', async () => {
        await repos.rooms.create(room());
        const updated = await repos.rooms.addPlayer('ABC234', player('p1'), 8);
        expect(updated?.players.map((p) => p.uid)).toEqual(['host', 'p1']);
      });

      it('addPlayer returns null for a duplicate player, a full room, a started game or an unknown room', async () => {
        await repos.rooms.create(room());
        expect(await repos.rooms.addPlayer('ABC234', player('host'), 8)).toBeNull();
        expect(await repos.rooms.addPlayer('ABC234', player('p1'), 1)).toBeNull();
        expect(await repos.rooms.addPlayer('NOPE23', player('p1'), 8)).toBeNull();

        await repos.rooms.create(room({ code: 'PLAY23', status: 'playing' }));
        expect(await repos.rooms.addPlayer('PLAY23', player('p1'), 8)).toBeNull();
      });

      it('addPlayer is atomic: simultaneous joins never exceed the limit', async () => {
        await repos.rooms.create(room());
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, i) => repos.rooms.addPlayer('ABC234', player(`p${i}`), 4)),
        );
        expect(results.filter(Boolean)).toHaveLength(3); // host + 3 = 4
        expect((await repos.rooms.findByCode('ABC234'))?.players).toHaveLength(4);
      });

      it('removePlayer, setHost and delete', async () => {
        await repos.rooms.create(room());
        await repos.rooms.addPlayer('ABC234', player('p1'), 8);
        const after = await repos.rooms.removePlayer('ABC234', 'host');
        expect(after?.players.map((p) => p.uid)).toEqual(['p1']);

        await repos.rooms.setHost('ABC234', 'p1');
        expect((await repos.rooms.findByCode('ABC234'))?.hostUid).toBe('p1');

        await repos.rooms.delete('ABC234');
        expect(await repos.rooms.findByCode('ABC234')).toBeNull();
      });

      it('updateSettings works only for the host in the lobby and keeps other settings', async () => {
        await repos.rooms.create(room());
        expect(
          await repos.rooms.updateSettings('ABC234', 'someone-else', { rounds: 3 }),
        ).toBeNull();

        const updated = await repos.rooms.updateSettings('ABC234', 'host', { rounds: 3 });
        expect(updated?.settings).toEqual({ rounds: 3, durationSec: 30, language: 'any' });

        await repos.rooms.create(room({ code: 'PLAY23', status: 'playing' }));
        expect(await repos.rooms.updateSettings('PLAY23', 'host', { rounds: 3 })).toBeNull();
      });
    });
  });
}
