import { z } from 'zod';
export * from './schemas/auth.js';
export * from './schemas/room.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().nonnegative(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
