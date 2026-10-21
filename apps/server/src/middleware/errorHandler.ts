import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { AppError, notFound } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound('NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }

    // Errors raised by Express itself, such as malformed JSON or a body that is too large.
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      res.status(status).json({
        error: { code: 'BAD_REQUEST', message: 'The request could not be processed' },
      });
      return;
    }

    logger.error({ err, method: req.method, path: req.path }, 'unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  };
}
