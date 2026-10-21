import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll } from 'vitest';
import {
  createMongoRefreshTokenRepo,
  RefreshTokenModel,
} from '../../src/modules/auth/refreshToken.mongo.js';
import { createMongoUserRepo, UserModel } from '../../src/modules/users/user.mongo.js';
import { describeRepoContract } from './repoContract.js';

let server: MongoMemoryServer;

beforeAll(async () => {
  // The first run downloads a MongoDB binary (about 100 MB) and caches it.
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri('tunerush_test'));
  // Unique indexes must exist before the duplicate-key checks run.
  await Promise.all([UserModel.init(), RefreshTokenModel.init()]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});

describeRepoContract('real MongoDB', async () => {
  await Promise.all([UserModel.deleteMany({}), RefreshTokenModel.deleteMany({})]);
  return {
    users: createMongoUserRepo(),
    refreshTokens: createMongoRefreshTokenRepo(),
  };
});
