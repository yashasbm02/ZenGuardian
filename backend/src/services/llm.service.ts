import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { env } from '../config/env';

export interface JournalAnalysis {
  stressScore: number;
  primaryEmotion: string;
  detectedTriggers: string[];
  copingStrategy: string;
  suggestions: string[];
}

export interface SimilarEntry {
  content: string;
  primaryEmotion: string;
  stressScore: number;
  createdAt: Date;
}

export interface InsightReport {
  recurringTriggers: string[];
  stressTrend: 'improving' | 'stable' | 'worsening';
  weeklyFocus: string;
  notablePatterns: string[];
}

export interface InsightEntry {
  content: string;
  moodMetrics: { stressScore: number; primaryEmotion: string; detectedTriggers: string[] };
  createdAt: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Tolerant JSON parse — strips ``` fences and slices to the outer object. */
function parseJsonObject<T>(text: string): T {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) t = fenced[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t) as T;
}

/**
 * Chat / generation runs on NVIDIA's OpenAI-compatible API (Kimi). Embeddings
 * live separately in `embedding.service.ts` (Gemini).
 */
class LlmService {
  private readonly client: OpenAI;
  private readonly model = env.NVIDIA_CHAT_MODEL;

  constructor() {
    this.client = new OpenAI({ apiKey: env.NVIDIA_API_KEY, baseURL: env.NVIDIA_BASE_URL });
  }

  private async completeJson(
    system: string,
    user: string,
    temperature: number,
  ): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });
    return res.choices[0]?.message?.content ?? '';
  }

  private async *streamChatCompletion(
    messages: ChatCompletionMessageParam[],
    temperature: number,
  ): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature,
      stream: true,
    });
    for await (const part of stream) {
      const token = part.choices[0]?.delta?.content;
      if (token) yield token;
    }
  }

  /** Extract structured wellbeing metrics + follow-up suggestions. */
  async analyze(content: string): Promise<JournalAnalysis> {
    const system =
      'You are a wellbeing analyst (NOT a clinician and NOT a diagnostician) for students in ' +
      'high-stakes entrance exams (NEET, JEE, CAT, UPSC, GATE). All string values must be in English. ' +
      'Respond with ONLY a JSON object with these keys:\n' +
      '- stressScore: integer 1-10 (1 = calm, 10 = severe distress)\n' +
      '- primaryEmotion: string, the single dominant emotion, lowercase\n' +
      '- detectedTriggers: array of strings (concrete stressors named or clearly implied)\n' +
      '- copingStrategy: string, one short actionable micro-intervention tailored to the entry\n' +
      '- suggestions: array of EXACTLY 3 short (max ~6 words) first-person follow-up prompts; ' +
      'supportive for distress (e.g. "Calm my exam anxiety"), practical for study/planning ' +
      '(e.g. "Effective study methods").';

    const raw = parseJsonObject<JournalAnalysis>(
      await this.completeJson(system, `Entry: """${content}"""`, 0.4),
    );
    return {
      stressScore: Number(raw.stressScore) || 5,
      primaryEmotion: raw.primaryEmotion ?? 'unspecified',
      detectedTriggers: Array.isArray(raw.detectedTriggers) ? raw.detectedTriggers : [],
      copingStrategy: raw.copingStrategy ?? 'Take a slow breath and name one small next step.',
      suggestions: Array.isArray(raw.suggestions) ? raw.suggestions.slice(0, 3) : [],
    };
  }

  /** Longitudinal pattern report across recent entries (oldest-first). */
  async generateInsightReport(entries: InsightEntry[]): Promise<InsightReport> {
    const summary = entries
      .map(
        (e, i) =>
          `Entry ${i + 1} (${e.createdAt}): stress=${e.moodMetrics.stressScore}, ` +
          `emotion=${e.moodMetrics.primaryEmotion}, triggers=[${e.moodMetrics.detectedTriggers.join(', ')}]\n` +
          `"${e.content.slice(0, 300)}"`,
      )
      .join('\n\n');

    const system =
      "You are a wellbeing analyst reviewing a student's journal entries over the past 1-2 weeks. " +
      'Identify longitudinal patterns, NOT individual incidents. Base every finding strictly on what ' +
      'is written. All string values must be in English. Respond with ONLY a JSON object with these keys:\n' +
      '- recurringTriggers: array of strings (stressors appearing across multiple entries)\n' +
      '- stressTrend: exactly one of "improving", "stable", "worsening"\n' +
      '- weeklyFocus: string, one concrete personalized recommendation for this week\n' +
      '- notablePatterns: array of up to 3 specific behavioural/emotional patterns to be aware of';

    const raw = parseJsonObject<InsightReport>(
      await this.completeJson(system, `Entries (oldest first):\n${summary}`, 0.3),
    );
    const validTrends = ['improving', 'stable', 'worsening'] as const;
    return {
      recurringTriggers: Array.isArray(raw.recurringTriggers) ? raw.recurringTriggers : [],
      stressTrend: validTrends.includes(raw.stressTrend) ? raw.stressTrend : 'stable',
      weeklyFocus: raw.weeklyFocus ?? '',
      notablePatterns: Array.isArray(raw.notablePatterns) ? raw.notablePatterns.slice(0, 3) : [],
    };
  }

  /** 3 short follow-up suggestion chips for a topic/question. Never throws. */
  async generateSuggestions(context: string): Promise<string[]> {
    try {
      const system =
        'Propose 3 natural next things the student might want to ask, given what they are exploring. ' +
        'Write them in English. Respond with ONLY a JSON object: ' +
        '{ "suggestions": [3 short (max ~6 words) first-person prompts] }.';
      const raw = parseJsonObject<{ suggestions?: string[] }>(
        await this.completeJson(system, `Currently exploring: """${context}"""`, 0.6),
      );
      return (raw.suggestions ?? []).slice(0, 3);
    } catch {
      return [];
    }
  }

  /** Stream an empathetic, RAG-grounded companion reply to a journal entry. */
  streamCompanionReply(content: string, history: SimilarEntry[]): AsyncGenerator<string> {
    const system =
      'You are ZenGuardian, a warm, grounded wellbeing companion for students preparing for ' +
      'high-stakes entrance exams (NEET, JEE, CAT, UPSC, GATE). Guidelines:\n' +
      '- Always respond in English.\n' +
      '- Be brief, human, and specific — 2 to 4 short sentences.\n' +
      "- When relevant, gently reference the student's own recurring patterns from their history.\n" +
      '- Never diagnose, never claim to be a therapist, never suggest medication.\n' +
      '- If the entry suggests self-harm, hopelessness, or crisis, calmly encourage reaching out to a ' +
      'trusted person or a helpline immediately.\n\n' +
      `The student's most semantically similar past entries (context only): ${JSON.stringify(history)}`;

    return this.streamChatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: `Today's entry: """${content}""". Respond with grounded, contextual support.` },
      ],
      0.8,
    );
  }

  /** Stream an answer to a tapped follow-up ("explore") — not persisted/analyzed. */
  streamExplore(question: string, context?: string): AsyncGenerator<string> {
    const system =
      'You are ZenGuardian, a warm, practical guide for students preparing for high-stakes entrance ' +
      'exams (NEET, JEE, CAT, UPSC, GATE). The student tapped a suggestion to explore a topic. Guidelines:\n' +
      '- Always respond in English.\n' +
      '- Answer directly, concretely, and concisely (a short paragraph or a few bullet points).\n' +
      '- Stay encouraging and protective of their wellbeing.\n' +
      '- Never diagnose, never claim to be a therapist, never suggest medication.\n' +
      '- If the topic touches self-harm, hopelessness, or crisis, gently encourage reaching out to a ' +
      'trusted person or a helpline immediately.' +
      (context ? `\n\nFor context, their original note was: """${context}"""` : '');

    return this.streamChatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: question },
      ],
      0.7,
    );
  }

  /**
   * Stream a turn of the always-available companion chat. `history` is the full
   * conversation (oldest-first, including the latest user message);
   * `personalizationContext` is a summary of the student's recent mood + relevant
   * journal snippets so replies are hyper-personalized.
   */
  streamChat(history: ChatTurn[], personalizationContext: string): AsyncGenerator<string> {
    const system =
      'You are ZenGuardian, an empathetic, always-available wellbeing companion for a student ' +
      'navigating high-stakes entrance exams (NEET, JEE, CAT, UPSC, GATE). Across the conversation, ' +
      'offer hyper-personalized, contextual support: real-time tailored coping strategies, adaptive ' +
      'mindfulness/breathing exercises, and genuine motivational encouragement. Guidelines:\n' +
      '- Always respond in English.\n' +
      '- Be warm, concise, and human; ask gentle follow-up questions.\n' +
      '- Use the personalization context to tailor advice to THIS student; reference their patterns naturally.\n' +
      '- When they want calm, guide a short concrete exercise step by step.\n' +
      '- Never diagnose, never claim to be a therapist, never suggest medication.\n' +
      '- If they express self-harm, hopelessness, or crisis, calmly and clearly encourage reaching out ' +
      'to a trusted person or a helpline immediately.\n\n' +
      `Personalization context (for grounding only):\n${personalizationContext}`;

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      ...history.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
    ];
    return this.streamChatCompletion(messages, 0.75);
  }
}

export const llm = new LlmService();
