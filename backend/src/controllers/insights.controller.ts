import type { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { JournalModel } from '../models/journal.model';
import { geminiService, type InsightReport } from '../services/gemini.service';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const MIN_ENTRIES_REQUIRED = 3;

interface CacheEntry {
  report: InsightReport;
  generatedAt: number;
}

// In-process LRU-lite: one cached report per userId, evicted after 6 h.
// Good enough for a single-instance Cloud Run deployment.
const cache = new Map<string, CacheEntry>();

/** GET /api/journal/insights — longitudinal pattern report. */
export async function getInsights(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.userId!;
    const bust = req.query.refresh === 'true';

    // Return cached report if still warm and the client didn't request a bust.
    const cached = cache.get(userId);
    if (!bust && cached && Date.now() - cached.generatedAt < SIX_HOURS_MS) {
      res.json({ report: cached.report, cached: true, generatedAt: new Date(cached.generatedAt) });
      return;
    }

    // Fetch the last 20 non-redacted entries in chronological order (oldest first
    // gives Gemini a temporal baseline for trend detection).
    const entries = await JournalModel.find({
      userId: new Types.ObjectId(userId),
      redacted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('content moodMetrics createdAt')
      .lean()
      .then((docs) => docs.reverse());

    if (entries.length < MIN_ENTRIES_REQUIRED) {
      res.json({
        report: null,
        message: `Write at least ${MIN_ENTRIES_REQUIRED} entries to unlock pattern insights.`,
      });
      return;
    }

    const report = await geminiService.generateInsightReport(
      entries.map((e) => ({
        content: e.content,
        moodMetrics: {
          stressScore: e.moodMetrics.stressScore,
          primaryEmotion: e.moodMetrics.primaryEmotion,
          detectedTriggers: e.moodMetrics.detectedTriggers,
        },
        createdAt: (e.createdAt as Date).toISOString(),
      })),
    );

    cache.set(userId, { report, generatedAt: Date.now() });
    res.json({ report, cached: false, generatedAt: new Date() });
  } catch (err) {
    next(err);
  }
}
