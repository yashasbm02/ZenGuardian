import { Schema, model, type Document, type Types } from 'mongoose';

export interface IEvent extends Document {
  type: string;
  userId?: Types.ObjectId;
  meta: Record<string, unknown>;
  createdAt: Date;
}

const eventSchema = new Schema<IEvent>(
  {
    type: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    // Auto-purge events after 30 days so the collection doesn't grow forever.
    expireAfterSeconds: 2_592_000,
  },
);

// TTL index on createdAt (Mongoose applies expireAfterSeconds to this field).
eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2_592_000 });

export const EventModel = model<IEvent>('Event', eventSchema);
