import path from 'node:path';
import fs from 'node:fs';
import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.routes';
import { journalRouter } from './routes/journal.routes';
import { chatRouter } from './routes/chat.routes';
import { userRouter } from './routes/user.routes';
import { adminRouter } from './routes/admin.routes';
import { notFound, errorHandler } from './middleware/error.middleware';

export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1); // Cloud Run / proxies — needed for secure cookies + rate-limit.
  app.use(helmet());
  app.use(cors({ origin: process.env.NODE_ENV === 'production' ? 'https://zenguardian.app' : 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // ── API ──────────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'zenguardian', time: new Date().toISOString() });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/journal', journalRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/user', userRouter);
  app.use('/api/admin', adminRouter);

  // Anything under /api that didn't match is a real 404 (JSON).
  app.use('/api', notFound);

  // ── Static frontend (production monolith) ─────────────────────────────────
  // In dev the Vite server handles the UI; this block only activates once the
  // bundle has been built into ../../frontend/dist.
  const clientDir = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
