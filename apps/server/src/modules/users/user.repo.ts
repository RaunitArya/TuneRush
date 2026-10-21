import type { UserStats } from '@tunerush/shared';

export interface UserRecord {
  uid: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatar: string | null;
  stats: UserStats;
  failedLogins: number;
  lockedUntil: Date | null;
  createdAt: Date;
}

export interface NewUser {
  uid: string;
  email: string;
  passwordHash: string;
  displayName: string;
}

export interface UserRepo {
  /** Throws AppError 409 EMAIL_TAKEN when the email already exists (unique index). */
  create(input: NewUser): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByUid(uid: string): Promise<UserRecord | null>;
  updateProfile(
    uid: string,
    patch: { displayName?: string; avatar?: string | null },
  ): Promise<UserRecord | null>;
  /** Adds one failed attempt; locks the account once `maxFailures` is reached. */
  recordLoginFailure(uid: string, maxFailures: number, lockUntil: Date): Promise<void>;
  resetLoginFailures(uid: string): Promise<void>;
}

export const emptyStats = (): UserStats => ({
  gamesPlayed: 0,
  wins: 0,
  totalScore: 0,
  songsGuessed: 0,
  bestStreak: 0,
  fastestGuessMs: null,
});
