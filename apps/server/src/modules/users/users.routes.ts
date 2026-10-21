import { Router } from 'express';
import { updateProfileSchema } from '@tunerush/shared';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { notFound } from '../../lib/errors.js';
import { getAuth, requireAuth, requireUser } from '../../middleware/auth.js';
import { valid, validate } from '../../middleware/validate.js';
import { toPublicProfile, toSelfUser } from './user.mapper.js';
import type { UserRepo } from './user.repo.js';

const uidParams = z.object({ uid: z.string().min(1).max(64) });

export function createUsersRoutes(opts: { env: Env; users: UserRepo }) {
  const { users } = opts;
  const router = Router();
  router.use(requireAuth(opts.env.JWT_ACCESS_SECRET), requireUser);

  router.get('/me', async (req, res) => {
    const user = await users.findByUid(getAuth(req).uid);
    if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
    res.json({ user: toSelfUser(user) });
  });

  // The uid comes from the verified token, never from the body or the URL.
  router.patch('/me', validate({ body: updateProfileSchema }), async (req, res) => {
    const patch = valid(res, 'body', updateProfileSchema);
    const user = await users.updateProfile(getAuth(req).uid, patch);
    if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
    res.json({ user: toSelfUser(user) });
  });

  router.get('/:uid', validate({ params: uidParams }), async (_req, res) => {
    const { uid } = valid(res, 'params', uidParams);
    const user = await users.findByUid(uid);
    if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
    res.json({ user: toPublicProfile(user) });
  });

  return router;
}
