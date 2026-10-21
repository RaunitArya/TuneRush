import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(8, 'Password must be atleast 8 characters').max(128);
export const displaySchema = z.string().trim().min(2).max(24);

export const registerSchema = z.object({
  email,
  password,
  displayName: displaySchema,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const guestSchema = z.object({
  displayName: displaySchema,
});

export const updateProfileSchema = z
  .object({
    displayName: displaySchema.optional(),
    avatar: z
      .url({ protocol: /^https?$/ })
      .max(500)
      .nullable()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide atleast one field' });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GuestInput = z.infer<typeof guestSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface UserStats {
  gamesPlayed: number;
  wins: number;
  totalScore: number;
  songsGuessed: number;
  bestStreak: number;
  fastestGuessMs: number | null;
}

/** What a user may see about themselves. */
export interface SelfUser {
  uid: string;
  email: string | null;
  displayName: string;
  avatar: string | null;
  isGuest: boolean;
  stats: UserStats;
}

/** What anyone else may see. No email. */
export interface PublicProfile {
  uid: string;
  displayName: string;
  avatar: string | null;
  stats: UserStats;
}

export interface AuthResponse {
  accessToken: string;
  user: SelfUser;
}
