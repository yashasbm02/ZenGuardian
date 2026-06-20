import { Router } from 'express';
import { getHistory, sendMessage, clearChat } from '../controllers/chat.controller';
import { requireAuth } from '../middleware/auth.middleware';

export const chatRouter = Router();

chatRouter.use(requireAuth);
chatRouter.get('/', getHistory);
chatRouter.post('/', sendMessage);
chatRouter.delete('/', clearChat);
