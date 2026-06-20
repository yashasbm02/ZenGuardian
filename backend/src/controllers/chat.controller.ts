import type { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { ChatMessageModel } from '../models/chatMessage.model';
import { JournalModel } from '../models/journal.model';
import { llm, type ChatTurn } from '../services/llm.service';
import { embeddings } from '../services/embedding.service';
import { retrieveSimilarEntries } from '../services/retrieval.service';
import { chatMessageSchema } from '../utils/validation';
import { detectsCrisis, CRISIS_RESOURCE_MESSAGE } from '../utils/safety';
import { eventLog } from '../services/eventLog.service';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

/** Write one framed SSE event. */
function sse(res: Response, type: string, data: unknown): void {
  res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
}

const HISTORY_WINDOW = 20; // prior turns sent back to the model

/**
 * Build the personalization context that makes the companion "hyper-personalized":
 * the student's recent mood snapshot + their most relevant journal snippets.
 */
async function buildPersonalization(userId: string, message: string): Promise<string> {
  const recent = await JournalModel.find({
    userId: new Types.ObjectId(userId),
    redacted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('moodMetrics createdAt')
    .lean();

  const moodLine = recent.length
    ? recent
        .map(
          (e) =>
            `${new Date(e.createdAt as Date).toLocaleDateString()}: ${e.moodMetrics.primaryEmotion} (stress ${e.moodMetrics.stressScore}/10)`,
        )
        .join('; ')
    : 'No journal entries yet.';

  // Best-effort RAG: pull semantically relevant past entries for this message.
  let snippets = '';
  try {
    const embedding = await embeddings.embed(message);
    const similar = await retrieveSimilarEntries(userId, embedding);
    if (similar.length) {
      snippets = similar.map((s) => `- "${s.content.slice(0, 200)}"`).join('\n');
    }
  } catch {
    // ignore — personalization is best-effort
  }

  return (
    `Recent mood (newest first): ${moodLine}` +
    (snippets ? `\n\nRelevant past journal entries:\n${snippets}` : '')
  );
}

/** GET /api/chat — the user's conversation history (chronological). */
export async function getHistory(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const messages = await ChatMessageModel.find({
      userId: new Types.ObjectId(req.userId),
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .select('role content createdAt')
      .lean();

    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/chat — one conversational turn (SSE: token* → [crisis] → done).
 * Persists both the user message and the assistant reply.
 */
export async function sendMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let streaming = false;
  try {
    const { message } = chatMessageSchema.parse(req.body);
    const userId = req.userId!;
    eventLog.log('chat.message', userId);

    // Persist the user's message immediately.
    await ChatMessageModel.create({ userId: new Types.ObjectId(userId), role: 'user', content: message });

    // Prior turns (chronological) → model history. Includes the message we just saved.
    const prior = await ChatMessageModel.find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(HISTORY_WINDOW)
      .select('role content')
      .lean();
    const history: ChatTurn[] = prior
      .reverse()
      .map((m) => ({ role: m.role, content: m.content }));

    const personalization = await buildPersonalization(userId, message);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    streaming = true;

    let full = '';
    for await (const token of llm.streamChat(history, personalization)) {
      if (token) {
        full += token;
        sse(res, 'token', token);
      }
    }

    // Persist the assistant reply so the conversation is remembered.
    if (full.trim()) {
      await ChatMessageModel.create({
        userId: new Types.ObjectId(userId),
        role: 'assistant',
        content: full,
      });
    }

    if (detectsCrisis(message)) {
      sse(res, 'crisis', CRISIS_RESOURCE_MESSAGE);
      eventLog.log('crisis.detected', userId, { source: 'chat' });
    }

    sse(res, 'done', null);
    res.end();
  } catch (err) {
    eventLog.log('llm.error', req.userId, {
      where: 'chat',
      error: err instanceof Error ? err.message : String(err),
    });
    if (streaming) {
      sse(res, 'error', 'Something went wrong. Please try again.');
      res.end();
      return;
    }
    next(err);
  }
}

/** DELETE /api/chat — clear the conversation. */
export async function clearChat(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await ChatMessageModel.deleteMany({ userId: new Types.ObjectId(req.userId) });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
