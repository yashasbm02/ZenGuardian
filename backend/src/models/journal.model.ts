import { Schema, model, type Document, type Types } from 'mongoose';

export interface IMoodMetrics {
  stressScore: number;
  primaryEmotion: string;
  detectedTriggers: string[];
  copingStrategy: string;
}

export interface IJournal extends Document {
  userId: Types.ObjectId;
  content: string;
  moodMetrics: IMoodMetrics;
  embedding: number[];
  redacted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const journalSchema = new Schema<IJournal>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: { type: String, required: true, trim: true },
    moodMetrics: {
      stressScore: { type: Number, required: true, min: 1, max: 10 },
      primaryEmotion: { type: String, required: true },
      detectedTriggers: { type: [String], default: [] },
      copingStrategy: { type: String, required: true },
    },
    // 768-dim vector. `select: false` so list/history queries never haul the
    // raw embedding back to the client by default.
    embedding: { type: [Number], required: true, select: false },
    redacted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

export const JournalModel = model<IJournal>('Journal', journalSchema);
