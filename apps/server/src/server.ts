import { createApp } from './app.js';
import { connectDb, createMongoRepos, disconnectDb, isDbReady } from './config/db.js';
import { parseEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';

const env = parseEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');

await connectDb(env.MONGO_URI);
logger.info('MongoDB connected');

const app = createApp({ env, logger, isReady: isDbReady, ...createMongoRepos() });

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on port ${env.PORT}`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received, closing server`);
  server.close(() => {
    void disconnectDb().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
