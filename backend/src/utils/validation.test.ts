import { describe, it, expect } from 'vitest';
import { credentialsSchema, journalEntrySchema } from './validation';

describe('Validation Schemas', () => {
  it('validates correct credentials', () => {
    const valid = { email: 'test@example.com', password: 'securepassword123' };
    expect(credentialsSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects short passwords', () => {
    const invalid = { email: 'test@example.com', password: 'short' };
    const result = credentialsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('at least 8 characters');
    }
  });

  it('rejects invalid emails', () => {
    const invalid = { email: 'not-an-email', password: 'securepassword123' };
    const result = credentialsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('validates journal entries', () => {
    expect(journalEntrySchema.safeParse({ content: 'I am feeling quite stressed about my upcoming exams.' }).success).toBe(true);
    expect(journalEntrySchema.safeParse({ content: 'Too short' }).success).toBe(false);
  });
});
