import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { isProd } from '../config/env';

/** App-level error with an explicit HTTP status. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** 404 fallthrough for unmatched API routes. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found.' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // `next` is required for Express to recognize this as an error handler.
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed.',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: isProd
      ? 'Internal server error.'
      : err instanceof Error
        ? err.message
        : 'Internal server error.',
  });
}
