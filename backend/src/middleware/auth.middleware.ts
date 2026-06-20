import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

interface JwtPayload {
  sub: string;
}

/**
 * Gate that reads the HTTP-only `auth_token` cookie and verifies it.
 *
 * Fix vs. blueprint: the token is verified against the validated `env.JWT_SECRET`
 * (no `|| 'emergency_fallback'`), so a misconfigured deploy fails closed at boot
 * rather than accepting tokens signed with a public default string.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = req.cookies?.auth_token;
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}
