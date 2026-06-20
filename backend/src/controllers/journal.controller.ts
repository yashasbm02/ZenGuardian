import type { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { JournalModel } from '../models/journal.model';
import { geminiService, type SimilarEntry } from '../services/gemini.service';
import { journalEntrySchema } from '../utils/validation';
import { detectsCrisis, CRISIS_RESOURCE_MESSAGE } from '../utils/safety';
import { HttpError } from '../middleware/error.middleware';
import { eventLog } from '../services/eventLog.service';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

/** Write one framed SSE event. */
function sse(res: Response, type: string, data: unknown): void {
  res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
}

/**
 * Retrieve the user's own semantically similar prior entries.
 *
 * Fix vs. blueprint: `userId` is applied via the `filter` field INSIDE
 * `$vectorSearch` (not a post-hoc `$match`), and `numCandidates` is wide enough
 * to actually find them. Degrades gracefully to `[]` if the Atlas Vector Search
 * index is missing, so the app still works on a fresh cluster.
 */
async function findSimilarEntries(
  userId: string,
  embedding: number[],
): Promise<SimilarEntry[]> {
  try {
    return await JournalModel.aggregate<SimilarEntry>([
      {
        $vectorSearch: {
          index: env.VECTOR_INDEX_NAME,
          path: 'embedding',
          queryVector: embedding,
          numCandidates: 150,
          limit: 4,
          filter: { userId: new Types.ObjectId(userId) },
        },
      },
      // Exclude redacted entries from RAG context.
      { $match: { redacted: { $ne: true } } },
      {
        $project: {
          _id: 0,
          content: 1,
          primaryEmotion: '$moodMetrics.primaryEmotion',
          stressScore: '$moodMetrics.stressScore',
          createdAt: 1,
        },
      },
    ]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      'Vector search unavailable (is the Atlas index created?). Continuing without history.',
      err instanceof Error ? err.message : err,
    );
    eventLog.log('vector.degraded', userId, {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * POST /api/journal — analyze + persist an entry, then stream a grounded reply.
 * Responds as Server-Sent Events: analysis → token* → [crisis] → done.
 */
export async function createEntry(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let streaming = false;
  try {
    const { content } = journalEntrySchema.parse(req.body);
    const userId = req.userId!;

    // 1) Embed, then retrieve history BEFORE inserting so the new entry can't
    //    match itself.
    const embedStart = Date.now();
    const embedding = await geminiService.embed(content);
    eventLog.log('gemini.embed', userId, { latencyMs: Date.now() - embedStart });
    const history = await findSimilarEntries(userId, embedding);

    // 2) Structured analysis.
    const analysis = await geminiService.analyze(content);

    // 3) Persist.
    const entry = await JournalModel.create({
      userId: new Types.ObjectId(userId),
      content,
      moodMetrics: analysis,
      embedding,
    });

    // 4) Open the SSE stream and send the structured analysis first.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    streaming = true;

    sse(res, 'analysis', {
      id: entry.id,
      moodMetrics: analysis,
      createdAt: entry.createdAt,
    });

    // 5) Stream the empathetic companion reply token-by-token.
    const stream = await geminiService.streamCompanionReply(content, history);
    for await (const chunk of stream) {
      if (chunk.text) sse(res, 'token', chunk.text);
    }

    // 6) Safety net — surface helpline resources on crisis signals.
    if (detectsCrisis(content, analysis.stressScore)) {
      sse(res, 'crisis', CRISIS_RESOURCE_MESSAGE);
      // Log anonymized — no content, just signal strength.
      eventLog.log('crisis.detected', userId, { stressScore: analysis.stressScore });
    }

    sse(res, 'done', null);
    res.end();
  } catch (err) {
    eventLog.log('gemini.error', req.userId, {
      error: err instanceof Error ? err.message : String(err),
    });
    if (streaming) {
      sse(res, 'error', 'Something went wrong while generating support.');
      res.end();
      return;
    }
    next(err);
  }
}

/** GET /api/journal — recent non-redacted entries for history + trend. */
export async function listEntries(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const entries = await JournalModel.find({
      userId: new Types.ObjectId(req.userId),
      redacted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('content moodMetrics createdAt')
      .lean();

    res.json({ entries });
  } catch (err) {
    next(err);
  }
}

const entryIdSchema = z.object({ id: z.string().length(24, 'Invalid entry id') });

/** DELETE /api/journal/:id — soft-redact a single entry owned by this user. */
export async function deleteEntry(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = entryIdSchema.parse(req.params);
    const entry = await JournalModel.findById(id).select('userId redacted');
    if (!entry) throw new HttpError(404, 'Entry not found.');
    if (String(entry.userId) !== req.userId) throw new HttpError(403, 'Not your entry.');

    await entry.updateOne({
      redacted: true,
      content: '[redacted]',
      embedding: [],
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
