import { Router } from 'express';
import { healthReport } from '../controllers/admin.controller';

export const adminRouter = Router();

// Key-gated — no auth cookie needed so monitoring tools can call this directly.
adminRouter.get('/health', healthReport);
