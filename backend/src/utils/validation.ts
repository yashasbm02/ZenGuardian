import { z } from 'zod';

/**
 * Plaintext credential rules. This is where password length is actually
 * enforced — before hashing — which the blueprint's model-level `minlength`
 * could not do (it only saw the bcrypt hash).
 */
export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be at most 128 characters.'),
});

export const journalEntrySchema = z.object({
  content: z
    .string()
    .trim()
    .min(10, 'Write at least a sentence so there is something to reflect on.')
    .max(8000, 'Entry is too long.'),
});

/** A tapped follow-up question + the original entry it relates to (for context). */
export const exploreSchema = z.object({
  question: z.string().trim().min(2, 'Question is too short.').max(300, 'Question is too long.'),
  context: z.string().trim().max(8000).optional(),
});

/** A single message sent to the companion chatbot. */
export const chatMessageSchema = z.object({
  message: z.string().trim().min(1, 'Say something to your companion.').max(4000, 'Message is too long.'),
});

export type Credentials = z.infer<typeof credentialsSchema>;
export type JournalEntryInput = z.infer<typeof journalEntrySchema>;
export type ExploreInput = z.infer<typeof exploreSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
