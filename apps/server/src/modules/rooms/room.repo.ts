import type { PublicPlayer, RoomSettings, RoomStatus } from '@tunerush/shared';

export interface RoomRecord {
  code: string;
  hostUid: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: PublicPlayer[];
  /** Never sent to clients. */
  songIds: string[];
  currentRound: number;
  expiresAt: Date;
}

export interface RoomRepo {
  /** Throws AppError 409 CODE_TAKEN when the code already exists (unique index). */
  create(room: RoomRecord): Promise<RoomRecord>;
  findByCode(code: string): Promise<RoomRecord | null>;
  /**
   * Adds the player in ONE atomic update, only if the room is in the lobby, the player is not
   * in it yet and there is space. Returns null when any condition fails.
   */
  addPlayer(code: string, player: PublicPlayer, maxPlayers: number): Promise<RoomRecord | null>;
  removePlayer(code: string, uid: string): Promise<RoomRecord | null>;
  setHost(code: string, uid: string): Promise<void>;
  /** Only succeeds for the host while the room is in the lobby. Returns null otherwise. */
  updateSettings(
    code: string,
    hostUid: string,
    settings: Partial<RoomSettings>,
  ): Promise<RoomRecord | null>;
  delete(code: string): Promise<void>;
}
