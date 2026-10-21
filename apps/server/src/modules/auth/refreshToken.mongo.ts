import { Schema, model } from 'mongoose';
import type { RefreshTokenRecord, RefreshTokenRepo } from './refreshToken.repo.js';

const refreshTokenSchema = new Schema<RefreshTokenRecord>({
  tokenHash: { type: String, required: true, unique: true },
  userUid: { type: String, required: true },
  familyId: { type: String, required: true, index: true },
  // TTL index: MongoDB deletes the document shortly after this date passes.
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  revokedAt: { type: Date, default: null },
  replacedBy: { type: String, default: null },
});

export const RefreshTokenModel = model<RefreshTokenRecord>('RefreshToken', refreshTokenSchema);

function toRecord(doc: RefreshTokenRecord): RefreshTokenRecord {
  return {
    tokenHash: doc.tokenHash,
    userUid: doc.userUid,
    familyId: doc.familyId,
    expiresAt: doc.expiresAt,
    revokedAt: doc.revokedAt ?? null,
    replacedBy: doc.replacedBy ?? null,
  };
}

export function createMongoRefreshTokenRepo(): RefreshTokenRepo {
  return {
    async create(record) {
      await RefreshTokenModel.create(record);
    },

    async findByHash(tokenHash) {
      const doc = await RefreshTokenModel.findOne({ tokenHash }).lean();
      return doc ? toRecord(doc) : null;
    },

    async revokeIfActive(tokenHash, replacedBy, now) {
      // The filter AND the update happen in one atomic operation: only one caller can match.
      const result = await RefreshTokenModel.updateOne(
        { tokenHash, revokedAt: null },
        { $set: { revokedAt: now, replacedBy } },
      );
      return result.modifiedCount === 1;
    },

    async revokeFamily(familyId, now) {
      await RefreshTokenModel.updateMany(
        { familyId, revokedAt: null },
        { $set: { revokedAt: now } },
      );
    },
  };
}
