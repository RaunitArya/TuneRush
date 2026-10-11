import { pino } from 'pino';

export function createLogger(level: string, pretty: boolean) {
  return pino({
    level,
    ...(pretty ? { transport: { target: 'pino-pretty' } } : {}),
  });
}
