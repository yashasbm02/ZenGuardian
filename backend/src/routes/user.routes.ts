import { Router } from 'express';
import { exportData, deleteAccount } from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth.middleware';

export const userRouter = Router();

userRouter.use(requireAuth);
userRouter.get('/export', exportData);
userRouter.delete('/', deleteAccount);
