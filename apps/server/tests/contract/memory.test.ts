import {
  createMemoryRefreshTokenRepo,
  createMemoryUserRepo,
  createMemoryRoomRepo,
} from '../helpers/memoryRepos.js';
import { describeRepoContract } from './repoContract.js';

describeRepoContract('in-memory fakes', async () => ({
  users: createMemoryUserRepo(),
  refreshTokens: createMemoryRefreshTokenRepo(),
  rooms: createMemoryRoomRepo(),
}));
