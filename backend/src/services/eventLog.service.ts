import { EventModel } from '../models/event.model';
import type { Types } from 'mongoose';

/**
 * Fire-and-forget structured event logger. Errors are swallowed so that logging
 * can never crash or slow down a user-facing request.
 */
class EventLogService {
  log(type: string, userId?: string | Types.ObjectId, meta: Record<string, unknown> = {}): void {
    EventModel.create({ type, userId, meta }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`[eventLog] Failed to write event "${type}":`, err instanceof Error ? err.message : err);
    });
  }
}

export const eventLog = new EventLogService();
