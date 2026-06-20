import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env, isProd } from '../config/env';
import { UserModel } from '../models/user.model';
import { credentialsSchema } from '../utils/validation';
import { HttpError } from '../middleware/error.middleware';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const COOKIE_NAME = 'auth_token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function issueSession(res: Response, userId: string): void {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

  // HTTP-only cookie keeps the token unreachable from JS (XSS-resistant).
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: SEVEN_DAYS_MS,
    path: '/',
  });
}

export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = credentialsSchema.parse(req.body);

    const existing = await UserModel.findOne({ email }).lean();
    if (existing) {
      throw new HttpError(409, 'An account with this email already exists.');
    }

    const user = await UserModel.create({ email, password });
    issueSession(res, user.id);
    res.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = credentialsSchema.parse(req.body);

    // password is `select:false`, so request it explicitly.
    const user = await UserModel.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      // Same message for both cases — don't leak which emails exist.
      throw new HttpError(401, 'Invalid email or password.');
    }

    issueSession(res, user.id);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.status(204).end();
}

export async function me(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await UserModel.findById(req.userId).lean();
    if (!user) {
      throw new HttpError(401, 'Session user no longer exists.');
    }
    res.json({ user: { id: String(user._id), email: user.email } });
  } catch (err) {
    next(err);
  }
}
