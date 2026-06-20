import 'dotenv/config';
import { z } from 'zod';

/**
 * Validate and freeze environment configuration at boot.
 *
 * Fix vs. blueprint: there is NO insecure fallback secret. If JWT_SECRET (or
 * any required value) is missing or weak, the process refuses to start instead
 * of silently signing tokens with a guessable key.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_CHAT_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),

  VECTOR_INDEX_NAME: z.string().default('journal_vector_index'),

  // Optional — if absent, the /api/admin/health endpoint returns 404.
  ADMIN_KEY: z.string().min(16).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:\n');
  for (const [key, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
    // eslint-disable-next-line no-console
    console.error(`  - ${key}: ${(messages ?? []).join(', ')}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
