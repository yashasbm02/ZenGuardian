import type { Request, Response, NextFunction } from 'express';
import { EventModel } from '../models/event.model';
import { env } from '../config/env';
import { HttpError } from '../middleware/error.middleware';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** GET /api/admin/health?key=<ADMIN_KEY> — aggregate operational health stats. */
export async function healthReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!env.ADMIN_KEY) throw new HttpError(404, 'Not found.');
    if (req.query.key !== env.ADMIN_KEY) throw new HttpError(401, 'Invalid admin key.');

    const now = Date.now();
    const since24h = new Date(now - ONE_DAY_MS);
    const since1h = new Date(now - ONE_HOUR_MS);

    const [dayCounts, hourCounts, embedLatencies] = await Promise.all([
      EventModel.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: since24h } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      EventModel.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: since1h }, type: 'gemini.error' } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      EventModel.aggregate<{ p95: number }>([
        { $match: { createdAt: { $gte: since1h }, type: 'gemini.embed' } },
        { $sort: { 'meta.latencyMs': 1 } },
        {
          $group: {
            _id: null,
            latencies: { $push: '$meta.latencyMs' },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            p95: {
              $arrayElemAt: [
                '$latencies',
                { $floor: { $multiply: [{ $subtract: ['$count', 1] }, 0.95] } },
              ],
            },
          },
        },
      ]),
    ]);

    const byType = Object.fromEntries(dayCounts.map((d) => [d._id, d.count]));

    res.json({
      generatedAt: new Date(),
      last24h: {
        journalEntries: byType['gemini.embed'] ?? 0,
        crisisDetections: byType['crisis.detected'] ?? 0,
        geminiErrors: byType['gemini.error'] ?? 0,
        vectorDegradations: byType['vector.degraded'] ?? 0,
      },
      lastHour: {
        geminiErrors: hourCounts[0]?.count ?? 0,
        embeddingP95Ms: embedLatencies[0]?.p95 ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}
