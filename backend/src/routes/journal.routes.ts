import { Router } from 'express';
import { createEntry, exploreEntry, listEntries, deleteEntry } from '../controllers/journal.controller';
import { getInsights } from '../controllers/insights.controller';
import { requireAuth } from '../middleware/auth.middleware';

export const journalRouter = Router();

// Every journal route requires an authenticated session.
journalRouter.use(requireAuth);
journalRouter.post('/', createEntry);
journalRouter.post('/explore', exploreEntry);
journalRouter.get('/', listEntries);
// /insights must be declared before /:id to prevent Express matching it as an id param.
journalRouter.get('/insights', getInsights);
journalRouter.delete('/:id', deleteEntry);
