import type { PublicRoom } from '@tunerush/shared';
import type { RoomRecord } from './room.repo.js';

/**
 * The ONLY way a room leaves the server. It copies fields one by one instead of spreading the
 * record, so a field added to the model later (songIds, answers) cannot leak by accident.
 */
export function toPublicRoom(room: RoomRecord): PublicRoom {
  return {
    code: room.code,
    hostUid: room.hostUid,
    status: room.status,
    settings: {
      rounds: room.settings.rounds,
      durationSec: room.settings.durationSec,
      language: room.settings.language,
    },
    players: room.players.map((p) => ({
      uid: p.uid,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      connected: p.connected,
    })),
    currentRound: room.currentRound,
  };
}
