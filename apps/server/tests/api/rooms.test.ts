import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '@tunerush/shared';
import { createRoomsService } from '../../src/modules/rooms/rooms.service.js';
import { createMemoryRoomRepo, createMemoryUserRepo } from '../helpers/memoryRepos.js';
import { buildTestApp } from '../helpers/testApp.js';

type App = ReturnType<typeof buildTestApp>['app'];

async function guest(app: App, name: string) {
  const res = await request(app).post('/api/v1/auth/guest').send({ displayName: name });
  return {
    uid: res.body.user.uid as string,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}
async function createRoom(app: App, auth: { Authorization: string }, body: object = {}) {
  return request(app).post('/api/v1/rooms').set(auth).send(body);
}

describe('rooms: create and read', () => {
  it('requires a token', async () => {
    const { app } = buildTestApp();
    expect((await request(app).post('/api/v1/rooms').send({})).status).toBe(401);
    expect((await request(app).get('/api/v1/rooms/ABC234')).status).toBe(401);
  });

  it('creates a room with a server-generated code, defaults, and the caller as host', async () => {
    const { app } = buildTestApp();
    const host = await guest(app, 'Hana');
    const res = await createRoom(app, host.auth);

    expect(res.status).toBe(201);
    expect(res.body.room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(res.body.room).toMatchObject({
      hostUid: host.uid,
      status: 'lobby',
      settings: { rounds: 10, durationSec: 30, language: 'any' },
      currentRound: 0,
    });
    expect(res.body.room.players).toEqual([
      { uid: host.uid, name: 'Hana', avatar: null, score: 0, connected: true },
    ]);
  });

  it('ignores a client-chosen code and validates settings', async () => {
    const { app } = buildTestApp();
    const host = await guest(app, 'Hana');
    const res = await createRoom(app, host.auth, { code: 'HACKED', settings: { rounds: 5 } });
    expect(res.status).toBe(201);
    expect(res.body.room.code).not.toBe('HACKED');
    expect(res.body.room.settings.rounds).toBe(5);

    expect((await createRoom(app, host.auth, { settings: { rounds: 999 } })).status).toBe(400);
  });

  it('never exposes song ids or any internal field', async () => {
    const { app, rooms } = buildTestApp();
    const host = await guest(app, 'Hana');
    const { body } = await createRoom(app, host.auth);
    // Simulate Phase 2 data being present on the stored record.
    const stored = await rooms.findByCode(body.room.code);
    expect(stored).toHaveProperty('songIds');

    const res = await request(app).get(`/api/v1/rooms/${body.room.code}`).set(host.auth);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.room).sort()).toEqual([
      'code',
      'currentRound',
      'hostUid',
      'players',
      'settings',
      'status',
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/songIds|expiresAt/);
  });

  it('GET returns 404 for an unknown room and 400 for a malformed code', async () => {
    const { app } = buildTestApp();
    const { auth } = await guest(app, 'Hana');
    expect((await request(app).get('/api/v1/rooms/ABC234').set(auth)).body.error.code).toBe(
      'ROOM_NOT_FOUND',
    );
    expect((await request(app).get('/api/v1/rooms/bad!').set(auth)).status).toBe(400);
  });
});

describe('rooms: join', () => {
  it('lets another player join by code, case-insensitively', async () => {
    const { app } = buildTestApp();
    const host = await guest(app, 'Hana');
    const other = await guest(app, 'Omar');
    const { body } = await createRoom(app, host.auth);

    const res = await request(app)
      .post('/api/v1/rooms/join')
      .set(other.auth)
      .send({ code: body.room.code.toLowerCase() });
    expect(res.status).toBe(200);
    expect(res.body.room.players.map((p: { name: string }) => p.name)).toEqual(['Hana', 'Omar']);
  });

  it('joining twice does not add the player twice', async () => {
    const { app } = buildTestApp();
    const host = await guest(app, 'Hana');
    const { body } = await createRoom(app, host.auth);
    await request(app).post('/api/v1/rooms/join').set(host.auth).send({ code: body.room.code });
    const res = await request(app)
      .post('/api/v1/rooms/join')
      .set(host.auth)
      .send({ code: body.room.code });
    expect(res.status).toBe(200);
    expect(res.body.room.players).toHaveLength(1);
  });

  it('refuses the ninth player', async () => {
    const { app } = buildTestApp();
    const host = await guest(app, 'Hana');
    const { body } = await createRoom(app, host.auth);
    for (let i = 1; i < MAX_PLAYERS; i++) {
      const p = await guest(app, `P${i}`);
      expect(
        (await request(app).post('/api/v1/rooms/join').set(p.auth).send({ code: body.room.code }))
          .status,
      ).toBe(200);
    }
    const late = await guest(app, 'Late');
    const res = await request(app)
      .post('/api/v1/rooms/join')
      .set(late.auth)
      .send({ code: body.room.code });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROOM_FULL');
  });

  it('refuses joining a game that already started', async () => {
    const { app, rooms } = buildTestApp();
    const host = await guest(app, 'Hana');
    const other = await guest(app, 'Omar');
    const { body } = await createRoom(app, host.auth);
    const stored = (await rooms.findByCode(body.room.code))!;
    await rooms.delete(stored.code);
    await rooms.create({ ...stored, status: 'playing' });

    const res = await request(app)
      .post('/api/v1/rooms/join')
      .set(other.auth)
      .send({ code: stored.code });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GAME_IN_PROGRESS');
  });

  it('returns 404 for an unknown code and 400 for a malformed one', async () => {
    const { app } = buildTestApp();
    const { auth } = await guest(app, 'Hana');
    expect(
      (await request(app).post('/api/v1/rooms/join').set(auth).send({ code: 'ABC234' })).status,
    ).toBe(404);
    expect(
      (await request(app).post('/api/v1/rooms/join').set(auth).send({ code: 'x' })).status,
    ).toBe(400);
  });
});

describe('rooms: host-only settings', () => {
  it('lets the host change settings and refuses everyone else', async () => {
    const { app } = buildTestApp();
    const host = await guest(app, 'Hana');
    const other = await guest(app, 'Omar');
    const { body } = await createRoom(app, host.auth);
    const code = body.room.code as string;
    await request(app).post('/api/v1/rooms/join').set(other.auth).send({ code });

    const denied = await request(app)
      .patch(`/api/v1/rooms/${code}`)
      .set(other.auth)
      .send({ settings: { rounds: 3 } });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_HOST');

    const ok = await request(app)
      .patch(`/api/v1/rooms/${code}`)
      .set(host.auth)
      .send({ settings: { rounds: 3 } });
    expect(ok.status).toBe(200);
    expect(ok.body.room.settings).toEqual({ rounds: 3, durationSec: 30, language: 'any' });
  });

  it('changes only the fields sent and leaves the other settings alone', async () => {
    const { app } = buildTestApp();
    const host = await guest(app, 'Hana');
    const { body } = await createRoom(app, host.auth);
    const patch = (settings: object) =>
      request(app).patch(`/api/v1/rooms/${body.room.code}`).set(host.auth).send({ settings });

    await patch({ durationSec: 45 });
    const res = await patch({ rounds: 3 });
    expect(res.body.room.settings).toEqual({ rounds: 3, durationSec: 45, language: 'any' });
  });

  it('rejects an empty or invalid settings patch', async () => {
    const { app } = buildTestApp();
    const host = await guest(app, 'Hana');
    const { body } = await createRoom(app, host.auth);
    const patch = (b: object) =>
      request(app).patch(`/api/v1/rooms/${body.room.code}`).set(host.auth).send(b);
    expect((await patch({ settings: {} })).status).toBe(400);
    expect((await patch({ settings: { durationSec: 1 } })).status).toBe(400);
  });
});

describe('rooms: leave', () => {
  it('hands the host role to the next player when the host leaves', async () => {
    const { app } = buildTestApp();
    const host = await guest(app, 'Hana');
    const other = await guest(app, 'Omar');
    const { body } = await createRoom(app, host.auth);
    const code = body.room.code as string;
    await request(app).post('/api/v1/rooms/join').set(other.auth).send({ code });

    expect((await request(app).post(`/api/v1/rooms/${code}/leave`).set(host.auth)).status).toBe(
      204,
    );
    const room = (await request(app).get(`/api/v1/rooms/${code}`).set(other.auth)).body.room;
    expect(room.hostUid).toBe(other.uid);
    expect(room.players).toHaveLength(1);
  });

  it('deletes the room when the last player leaves', async () => {
    const { app } = buildTestApp();
    const host = await guest(app, 'Hana');
    const { body } = await createRoom(app, host.auth);
    await request(app).post(`/api/v1/rooms/${body.room.code}/leave`).set(host.auth);
    expect((await request(app).get(`/api/v1/rooms/${body.room.code}`).set(host.auth)).status).toBe(
      404,
    );
  });
});

describe('rooms service: code collisions', () => {
  it('retries with a new code when the first one is already taken', async () => {
    const codes = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
    const service = createRoomsService({
      rooms: createMemoryRoomRepo(),
      users: createMemoryUserRepo(),
      makeCode: () => codes.shift()!,
    });
    const host = { uid: 'g_1', isGuest: true, name: 'Hana' };
    const settings = { rounds: 10, durationSec: 30, language: 'any' };

    const first = await service.create(host, { settings });
    const second = await service.create({ ...host, uid: 'g_2' }, { settings });
    expect(first.code).toBe('AAAAAA');
    expect(second.code).toBe('BBBBBB');
  });

  it('gives up with a 503 after too many collisions', async () => {
    const service = createRoomsService({
      rooms: createMemoryRoomRepo(),
      users: createMemoryUserRepo(),
      makeCode: () => 'AAAAAA',
    });
    const host = { uid: 'g_1', isGuest: true, name: 'Hana' };
    const settings = { rounds: 10, durationSec: 30, language: 'any' };
    await service.create(host, { settings });
    await expect(service.create({ ...host, uid: 'g_2' }, { settings })).rejects.toMatchObject({
      statusCode: 503,
      code: 'CODE_GENERATION_FAILED',
    });
  });
});
