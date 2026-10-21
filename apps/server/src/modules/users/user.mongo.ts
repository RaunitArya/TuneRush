import { Schema, model } from 'mongoose';
import { conflict } from '../../lib/errors.js';
import { isDuplicateKeyError } from '../../lib/mongoErrors.js';
import { emptyStats, type NewUser, type UserRecord, type UserRepo } from './user.repo.js';

const userSchema = new Schema<UserRecord>({
  uid: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String, required: true },
  avatar: { type: String, default: null },
  stats: {
    type: new Schema(
      {
        gamesPlayed: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        totalScore: { type: Number, default: 0 },
        songsGuessed: { type: Number, default: 0 },
        bestStreak: { type: Number, default: 0 },
        fastestGuessMs: { type: Number, default: null },
      },
      { _id: false },
    ),
    default: () => emptyStats(),
  },
  failedLogins: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  createdAt: { type: Date, default: () => new Date() },
});

export const UserModel = model<UserRecord>('User', userSchema);

/** Copies only the fields we own, so Mongo's _id and __v never travel into the rest of the app. */
function toRecord(doc: UserRecord): UserRecord {
  return {
    uid: doc.uid,
    email: doc.email,
    passwordHash: doc.passwordHash,
    displayName: doc.displayName,
    avatar: doc.avatar ?? null,
    stats: { ...emptyStats(), ...doc.stats },
    failedLogins: doc.failedLogins,
    lockedUntil: doc.lockedUntil ?? null,
    createdAt: doc.createdAt,
  };
}

export function createMongoUserRepo(): UserRepo {
  return {
    async create(input: NewUser) {
      try {
        const doc = await UserModel.create(input);
        return toRecord(doc.toObject());
      } catch (err) {
        if (isDuplicateKeyError(err)) throw conflict('EMAIL_TAKEN', 'Email is already registered');
        throw err;
      }
    },

    async findByEmail(email) {
      const doc = await UserModel.findOne({ email }).lean();
      return doc ? toRecord(doc) : null;
    },

    async findByUid(uid) {
      const doc = await UserModel.findOne({ uid }).lean();
      return doc ? toRecord(doc) : null;
    },

    async updateProfile(uid, patch) {
      const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const doc = await UserModel.findOneAndUpdate(
        { uid },
        { $set: set },
        { returnDocument: 'after' },
      ).lean();
      return doc ? toRecord(doc) : null;
    },

    async recordLoginFailure(uid, maxFailures, lockUntil) {
      // $inc is atomic, so two parallel wrong passwords are both counted.
      const doc = await UserModel.findOneAndUpdate(
        { uid },
        { $inc: { failedLogins: 1 } },
        { returnDocument: 'after' },
      ).lean();
      if (doc && doc.failedLogins >= maxFailures) {
        // Reset the counter when locking, so the user gets a fresh set of tries afterwards.
        await UserModel.updateOne({ uid }, { $set: { lockedUntil: lockUntil, failedLogins: 0 } });
      }
    },

    async resetLoginFailures(uid) {
      await UserModel.updateOne({ uid }, { $set: { failedLogins: 0, lockedUntil: null } });
    },
  };
}
