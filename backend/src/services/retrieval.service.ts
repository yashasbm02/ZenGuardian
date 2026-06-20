import { Types } from 'mongoose';
import { env } from '../config/env';
import { JournalModel } from '../models/journal.model';
import { eventLog } from './eventLog.service';
import type { SimilarEntry } from './llm.service';

/**
 * Retrieve a user's own semantically similar prior entries via Atlas Vector
 * Search. `userId` is applied through the `filter` field INSIDE `$vectorSearch`
 * (not a post-hoc `$match`), redacted entries are excluded, and the whole thing
 * degrades to `[]` if the index is missing or the embedding is empty. Shared by
 * the journal flow and the chat companion.
 */
export async function retrieveSimilarEntries(
  userId: string,
  embedding: number[],
): Promise<SimilarEntry[]> {
  if (!embedding.length) return [];
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
