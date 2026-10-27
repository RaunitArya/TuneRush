import { Router } from 'express';
import {
  createRoomSchema,
  joinRoomSchema,
  roomParamsSchema,
  updateRoomSchema,
} from '@tunerush/shared';
import type { Env } from '../../config/env.js';
import { getAuth, requireAuth } from '../../middleware/auth.js';
import { valid, validate } from '../../middleware/validate.js';
import { toPublicRoom } from './room.mapper.js';
import type { RoomsService } from './rooms.service.js';

export function createRoomsRoutes(opts: { env: Env; rooms: RoomsService }) {
  const { rooms } = opts;
  const router = Router();
  router.use(requireAuth(opts.env.JWT_ACCESS_SECRET));

  router.post('/', validate({ body: createRoomSchema }), async (req, res) => {
    const room = await rooms.create(getAuth(req), valid(res, 'body', createRoomSchema));
    res.status(201).json({ room: toPublicRoom(room) });
  });

  // Registered before '/:code' so "join" is not read as a room code.
  router.post('/join', validate({ body: joinRoomSchema }), async (req, res) => {
    const { code } = valid(res, 'body', joinRoomSchema);
    res.json({ room: toPublicRoom(await rooms.join(getAuth(req), code)) });
  });

  router.get('/:code', validate({ params: roomParamsSchema }), async (_req, res) => {
    const { code } = valid(res, 'params', roomParamsSchema);
    res.json({ room: toPublicRoom(await rooms.get(code)) });
  });

  router.patch(
    '/:code',
    validate({ params: roomParamsSchema, body: updateRoomSchema }),
    async (req, res) => {
      const { code } = valid(res, 'params', roomParamsSchema);
      const { settings } = valid(res, 'body', updateRoomSchema);
      res.json({ room: toPublicRoom(await rooms.updateSettings(getAuth(req), code, settings)) });
    },
  );

  router.post('/:code/leave', validate({ params: roomParamsSchema }), async (req, res) => {
    const { code } = valid(res, 'params', roomParamsSchema);
    await rooms.leave(getAuth(req), code);
    res.status(204).end();
  });

  return router;
}
