import type { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { JournalModel } from '../models/journal.model';
import { llm } from '../services/llm.service';
import { embeddings } from '../services/embedding.service';
import { retrieveSimilarEntries } from '../services/retrieval.service';
import { journalEntrySchema, exploreSchema } from '../utils/validation';
import { detectsCrisis, CRISIS_RESOURCE_MESSAGE } from '../utils/safety';
import { HttpError } from '../middleware/error.middleware';
import { eventLog } from '../services/eventLog.service';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

/** Write one framed SSE event. */
function sse(res: Response, type: string, data: unknown): void {
  res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
}

/** Best-effort embedding — never blocks an entry if the provider is down. */
async function embedSafe(userId: string, text: string): Promise<number[]> {
  try {
    return await embeddings.embed(text);
  } catch (err) {
    eventLog.log('embed.failed', userId, {
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

    // 1) Embed (best-effort), then retrieve history BEFORE inserting so the new
    //    entry can't match itself.
    const embedStart = Date.now();
    const embedding = await embedSafe(userId, content);
    eventLog.log('embed.done', userId, { latencyMs: Date.now() - embedStart, ok: embedding.length > 0 });
    const history = await retrieveSimilarEntries(userId, embedding);

    // 2) Structured analysis. `suggestions` are ephemeral UI chips — split them
    //    out so only the mood metrics get persisted.
    const analysis = await llm.analyze(content);
    const { suggestions = [], ...moodMetrics } = analysis;

    // 3) Persist.
    const entry = await JournalModel.create({
      userId: new Types.ObjectId(userId),
      content,
      moodMetrics,
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
      moodMetrics,
      suggestions,
      createdAt: entry.createdAt,
    });

    // 5) Stream the empathetic companion reply token-by-token.
    for await (const token of llm.streamCompanionReply(content, history)) {
      if (token) sse(res, 'token', token);
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
    eventLog.log('llm.error', req.userId, {
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

/**
 * POST /api/journal/explore — answer a tapped follow-up suggestion.
 * Streams a reply (SSE: token* → [crisis] → suggestions → done) but does NOT
 * embed, mood-analyze, or persist anything. Keeps mood-tracking data clean.
 */
export async function exploreEntry(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let streaming = false;
  try {
    const { question, context } = exploreSchema.parse(req.body);
    eventLog.log('explore.asked', req.userId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    streaming = true;

    for await (const token of llm.streamExplore(question, context)) {
      if (token) sse(res, 'token', token);
    }

    if (detectsCrisis(question)) {
      sse(res, 'crisis', CRISIS_RESOURCE_MESSAGE);
    }

    // Fresh chips so the student can keep drilling down.
    const suggestions = await llm.generateSuggestions(question);
    sse(res, 'suggestions', suggestions);

    sse(res, 'done', null);
    res.end();
  } catch (err) {
    eventLog.log('llm.error', req.userId, {
      where: 'explore',
      error: err instanceof Error ? err.message : String(err),
    });
    if (streaming) {
      sse(res, 'error', 'Something went wrong while exploring that.');
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
