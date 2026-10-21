import { beforeEach, describe, expect, it } from 'vitest';
import type { RefreshTokenRepo } from '../../src/modules/auth/refreshToken.repo.js';
import type { UserRepo } from '../../src/modules/users/user.repo.js';

export interface Repos {
  users: UserRepo;
  refreshTokens: RefreshTokenRepo;
}

const newUser = (n: number) => ({
  uid: `u${n}`,
  email: `u${n}@example.com`,
  passwordHash: 'hash',
  displayName: `User ${n}`,
});

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
  });
}
