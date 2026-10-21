import type { PublicProfile, SelfUser } from '@tunerush/shared';
import type { UserRecord } from './user.repo.js';

export const toSelfUser = (u: UserRecord): SelfUser => ({
  uid: u.uid,
  email: u.email,
  displayName: u.displayName,
  avatar: u.avatar,
  isGuest: false,
  stats: u.stats,
});

export const toPublicProfile = (u: UserRecord): PublicProfile => ({
  uid: u.uid,
  displayName: u.displayName,
  avatar: u.avatar,
  stats: u.stats,
});
