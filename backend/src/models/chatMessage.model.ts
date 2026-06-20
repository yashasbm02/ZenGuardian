import { Schema, model, type Document, type Types } from 'mongoose';

export interface IChatMessage extends Document {
  userId: Types.ObjectId;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Fetch + order a user's conversation efficiently.
chatMessageSchema.index({ userId: 1, createdAt: 1 });

export const ChatMessageModel = model<IChatMessage>('ChatMessage', chatMessageSchema);
