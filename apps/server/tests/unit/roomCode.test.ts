import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, roomCodeSchema } from '@tunerush/shared';
import { generateRoomCode } from '../../src/modules/rooms/roomCode.js';

describe('generateRoomCode', () => {
  it('uses only the safe alphabet and the right length', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it('never contains look-alike characters', () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OIl]/);
  });

  it('produces codes the shared schema accepts', () => {
    expect(roomCodeSchema.safeParse(generateRoomCode()).success).toBe(true);
  });
});

describe('roomCodeSchema', () => {
  it('upper-cases and trims user input', () => {
    expect(roomCodeSchema.parse('  abc234 ')).toBe('ABC234');
  });
  it('rejects wrong length and forbidden characters', () => {
    expect(roomCodeSchema.safeParse('ABC12').success).toBe(false);
    expect(roomCodeSchema.safeParse('ABCDE0').success).toBe(false);
  });
});
