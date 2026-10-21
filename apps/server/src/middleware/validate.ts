import type { RequestHandler, Response } from 'express';
import { ZodError, type z } from 'zod';
import { badRequest } from '../lib/errors.js';

interface Schemas {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

interface Validated {
  body?: unknown;
  params?: unknown;
  query?: unknown;
}

/**
 * Only this middleware knows the data came from the request, so only here is a failed parse the
 * client's fault (400). A ZodError raised anywhere else (for example while parsing a third-party
 * response) is our bug and falls through to the generic 500 in the error handler, where it is logged.
 */
function parseRequestPart<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      throw badRequest(
        'VALIDATION_ERROR',
        'Request validation failed',
        err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    throw err;
  }
}

/**
 * Validates body, params and query and stores the PARSED values in `res.locals.valid`.
 * Express 5 makes `req.query` read-only, so we never try to overwrite request fields.
 * A failed parse becomes a 400 AppError and the central error handler sends it.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const valid: Validated = {};
    if (schemas.body) valid.body = parseRequestPart(schemas.body, req.body ?? {});
    if (schemas.params) valid.params = parseRequestPart(schemas.params, req.params);
    if (schemas.query) valid.query = parseRequestPart(schemas.query, req.query);
    res.locals['valid'] = valid;
    next();
  };
}

export function valid<T extends keyof Validated, S extends z.ZodType>(
  res: Response,
  part: T,
  _schema: S,
): z.output<S> {
  return (res.locals['valid'] as Validated)[part] as z.output<S>;
}
