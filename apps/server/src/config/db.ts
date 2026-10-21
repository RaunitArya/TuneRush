import mongoose from 'mongoose';
import {
  createMongoRefreshTokenRepo,
  RefreshTokenModel,
} from '../modules/auth/refreshToken.mongo.js';
import { createMongoUserRepo, UserModel } from '../modules/users/user.mongo.js';

export async function connectDb(uri: string) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Build the unique indexes now. Duplicate-email and duplicate-code handling depends on them.
  await Promise.all([UserModel.init(), RefreshTokenModel.init()]);
}

export const disconnectDb = () => mongoose.disconnect();

/** readyState 1 means connected. The ping also catches a database that went away. */
export async function isDbReady(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db?.admin().ping();
    return true;
  } catch {
    return false;
  }
}

export const createMongoRepos = () => ({
  users: createMongoUserRepo(),
  refreshTokens: createMongoRefreshTokenRepo(),
});
