import { z } from 'zod';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 8;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`), 'Invalid room code');

// The rules live in one place. Defaults are added only for creating a room: if they were part of
// the PATCH schema, sending { rounds: 3 } would silently reset every other setting to its default.
const settingRules = {
  rounds: z.number().int().min(1).max(20),
  durationSec: z.number().int().min(10).max(60),
  language: z.string().trim().min(2).max(10),
};

export const roomSettingsSchema = z.object({
  rounds: settingRules.rounds.default(10),
  durationSec: settingRules.durationSec.default(30),
  language: settingRules.language.default('any'),
});

export const createRoomSchema = z.object({
  settings: roomSettingsSchema.default({ rounds: 10, durationSec: 30, language: 'any' }),
});

export const joinRoomSchema = z.object({ code: roomCodeSchema });
export const roomParamsSchema = z.object({ code: roomCodeSchema });

export const updateRoomSchema = z.object({
  settings: z
    .object(settingRules)
    .partial()
    .refine((v) => Object.keys(v).length > 0, {
      message: 'Provide at least one setting',
    }),
});

export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface PublicPlayer {
  uid: string;
  name: string;
  avatar: string | null;
  score: number;
  connected: boolean;
}

/** The only room shape clients ever receive. It has no song ids and no answers. */
export interface PublicRoom {
  code: string;
  hostUid: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: PublicPlayer[];
  currentRound: number;
}
