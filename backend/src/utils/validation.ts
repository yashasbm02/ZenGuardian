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

export type Credentials = z.infer<typeof credentialsSchema>;
export type JournalEntryInput = z.infer<typeof journalEntrySchema>;
