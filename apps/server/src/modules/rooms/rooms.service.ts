import {
  MAX_PLAYERS,
  type CreateRoomInput,
  type PublicPlayer,
  type RoomSettings,
} from '@tunerush/shared';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../auth/tokens.js';
import type { UserRepo } from '../users/user.repo.js';
import type { RoomRecord, RoomRepo } from './room.repo.js';
import { generateRoomCode } from './roomCode.js';

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export interface RoomsServiceDeps {
  rooms: RoomRepo;
  users: UserRepo;
  now?: () => Date;
  makeCode?: () => string;
}

export function createRoomsService({
  rooms,
  users,
  now = () => new Date(),
  makeCode = generateRoomCode,
}: RoomsServiceDeps) {
  /** Guests carry their name in the token; real users are looked up so renames apply. */
  async function toPlayer(auth: AuthContext): Promise<PublicPlayer> {
    if (auth.isGuest) {
      return { uid: auth.uid, name: auth.name ?? 'Guest', avatar: null, score: 0, connected: true };
    }
    const user = await users.findByUid(auth.uid);
    if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
    return {
      uid: user.uid,
      name: user.displayName,
      avatar: user.avatar,
      score: 0,
      connected: true,
    };
  }

  async function getOrThrow(code: string): Promise<RoomRecord> {
    const room = await rooms.findByCode(code);
    if (!room) throw notFound('ROOM_NOT_FOUND', 'Room not found');
    return room;
  }

  return {
    async create(auth: AuthContext, input: CreateRoomInput): Promise<RoomRecord> {
      const host = await toPlayer(auth);
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        try {
          return await rooms.create({
            code: makeCode(),
            hostUid: auth.uid,
            status: 'lobby',
            settings: input.settings,
            players: [host],
            songIds: [],
            currentRound: 0,
            expiresAt: new Date(now().getTime() + ROOM_TTL_MS),
          });
        } catch (err) {
          // Two rooms picked the same code: the unique index rejected one. Try another code.
          if (err instanceof AppError && err.code === 'CODE_TAKEN') continue;
          throw err;
        }
      }
      throw new AppError(503, 'CODE_GENERATION_FAILED', 'Could not allocate a room code');
    },

    async join(auth: AuthContext, code: string): Promise<RoomRecord> {
      const player = await toPlayer(auth);
      const updated = await rooms.addPlayer(code, player, MAX_PLAYERS);
      if (updated) return updated;

      // The atomic update refused. Look again only to explain why.
      const room = await getOrThrow(code);
      if (room.players.some((p) => p.uid === auth.uid)) {
        return room; // joining twice is harmless
      }
      if (room.status !== 'lobby') throw conflict('GAME_IN_PROGRESS', 'The game already started');
      throw conflict('ROOM_FULL', 'The room is full');
    },

    get: getOrThrow,

    async updateSettings(
      auth: AuthContext,
      code: string,
      settings: Partial<RoomSettings>,
    ): Promise<RoomRecord> {
      const updated = await rooms.updateSettings(code, auth.uid, settings);
      if (updated) return updated;

      const room = await getOrThrow(code);
      if (room.hostUid !== auth.uid) throw forbidden('NOT_HOST', 'Only the host can do this');
      throw conflict('GAME_IN_PROGRESS', 'Settings can only change in the lobby');
    },

    async leave(auth: AuthContext, code: string): Promise<void> {
      await getOrThrow(code);
      const room = await rooms.removePlayer(code, auth.uid);
      if (!room) return;
      if (room.players.length === 0) {
        await rooms.delete(code);
      } else if (room.hostUid === auth.uid) {
        const [next] = room.players;
        if (next) await rooms.setHost(code, next.uid);
      }
    },
  };
}

export type RoomsService = ReturnType<typeof createRoomsService>;
