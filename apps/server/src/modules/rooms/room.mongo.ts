import { Schema, model } from 'mongoose';
import { conflict } from '../../lib/errors.js';
import { isDuplicateKeyError } from '../../lib/mongoErrors.js';
import type { RoomRecord, RoomRepo } from './room.repo.js';

const roomSchema = new Schema<RoomRecord>({
  code: { type: String, required: true, unique: true },
  hostUid: { type: String, required: true, index: true },
  status: { type: String, enum: ['lobby', 'playing', 'finished'], default: 'lobby' },
  settings: {
    type: new Schema(
      {
        rounds: { type: Number, required: true },
        durationSec: { type: Number, required: true },
        language: { type: String, required: true },
      },
      { _id: false },
    ),
    required: true,
  },
  players: [
    new Schema(
      {
        uid: { type: String, required: true },
        name: { type: String, required: true },
        avatar: { type: String, default: null },
        score: { type: Number, default: 0 },
        connected: { type: Boolean, default: true },
      },
      { _id: false },
    ),
  ],
  songIds: { type: [String], default: [] },
  currentRound: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

export const RoomModel = model<RoomRecord>('Room', roomSchema);

function toRecord(doc: RoomRecord): RoomRecord {
  return {
    code: doc.code,
    hostUid: doc.hostUid,
    status: doc.status,
    settings: {
      rounds: doc.settings.rounds,
      durationSec: doc.settings.durationSec,
      language: doc.settings.language,
    },
    players: doc.players.map((p) => ({
      uid: p.uid,
      name: p.name,
      avatar: p.avatar ?? null,
      score: p.score,
      connected: p.connected,
    })),
    songIds: [...doc.songIds],
    currentRound: doc.currentRound,
    expiresAt: doc.expiresAt,
  };
}

export function createMongoRoomRepo(): RoomRepo {
  return {
    async create(room) {
      try {
        const doc = await RoomModel.create(room);
        return toRecord(doc.toObject());
      } catch (err) {
        if (isDuplicateKeyError(err)) throw conflict('CODE_TAKEN', 'Room code already exists');
        throw err;
      }
    },

    async findByCode(code) {
      const doc = await RoomModel.findOne({ code }).lean();
      return doc ? toRecord(doc) : null;
    },

    async addPlayer(code, player, maxPlayers) {
      // Every rule is part of the filter, so check and write are ONE atomic operation.
      // Loading the room, checking in JavaScript and saving would let two joins overwrite each other.
      const doc = await RoomModel.findOneAndUpdate(
        {
          code,
          status: 'lobby',
          'players.uid': { $ne: player.uid },
          $expr: { $lt: [{ $size: '$players' }, maxPlayers] },
        },
        { $push: { players: player } },
        { returnDocument: 'after' },
      ).lean();
      return doc ? toRecord(doc) : null;
    },

    async removePlayer(code, uid) {
      const doc = await RoomModel.findOneAndUpdate(
        { code },
        { $pull: { players: { uid } } },
        { returnDocument: 'after' },
      ).lean();
      return doc ? toRecord(doc) : null;
    },

    async setHost(code, uid) {
      await RoomModel.updateOne({ code }, { $set: { hostUid: uid } });
    },

    async updateSettings(code, hostUid, settings) {
      const set = Object.fromEntries(
        Object.entries(settings)
          .filter(([, v]) => v !== undefined)
          .map(([key, value]) => [`settings.${key}`, value]),
      );
      const doc = await RoomModel.findOneAndUpdate(
        { code, hostUid, status: 'lobby' },
        { $set: set },
        { returnDocument: 'after' },
      ).lean();
      return doc ? toRecord(doc) : null;
    },

    async delete(code) {
      await RoomModel.deleteOne({ code });
    },
  };
}
