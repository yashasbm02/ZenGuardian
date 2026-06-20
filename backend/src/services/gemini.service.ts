import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env';

export interface JournalAnalysis {
  stressScore: number;
  primaryEmotion: string;
  detectedTriggers: string[];
  copingStrategy: string;
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

/** Structured-output schema for longitudinal insight reports. */
const insightSchema = {
  type: Type.OBJECT,
  properties: {
    recurringTriggers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Stressors that appear in multiple entries across the period.',
    },
    stressTrend: {
      type: Type.STRING,
      description:
        'Whether average stress is improving, stable, or worsening over the period. ' +
        'Must be exactly one of: "improving", "stable", "worsening".',
    },
    weeklyFocus: {
      type: Type.STRING,
      description:
        'One concrete, personalized recommendation the student should focus on this week, ' +
        'grounded in their own words and patterns.',
    },
    notablePatterns: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Up to 3 specific behavioural or emotional patterns worth the student being aware of ' +
        '(e.g. sleep deprivation before tests, self-doubt after peer comparisons).',
    },
  },
  required: ['recurringTriggers', 'stressTrend', 'weeklyFocus', 'notablePatterns'],
};

/** Structured-output schema for the analysis pass. */
const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    stressScore: {
      type: Type.INTEGER,
      description: 'Burnout / acute-stress risk on a 1-10 scale (1 = calm, 10 = severe distress).',
    },
    primaryEmotion: {
      type: Type.STRING,
      description: 'The single dominant emotion, lowercase (e.g. anxiety, hope, frustration, calm, overwhelm).',
    },
    detectedTriggers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Concrete stressors named or clearly implied: mock-test performance, schedule strain, sleep loss, peer comparison, parental pressure, self-doubt.',
    },
    copingStrategy: {
      type: Type.STRING,
      description: 'One short, concrete, immediately actionable micro-intervention tailored to this entry.',
    },
  },
  required: ['stressScore', 'primaryEmotion', 'detectedTriggers', 'copingStrategy'],
};

/** L2-normalize so cosine similarity stays valid for reduced-dimension vectors. */
function normalize(vector: number[]): number[] {
  let sumSquares = 0;
  for (const x of vector) sumSquares += x * x;
  const magnitude = Math.sqrt(sumSquares);
  return magnitude === 0 ? vector : vector.map((x) => x / magnitude);
}

export class GeminiService {
  private readonly ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  /**
   * Produce an embedding for a journal entry.
   *
   * Fix vs. blueprint: `gemini-embedding-2` is not a real model and would 404.
   * Default is `text-embedding-004` (native, normalized 768-dim). We pass
   * `outputDimensionality` so the vector always matches the Atlas index width,
   * and re-normalize for models (e.g. gemini-embedding-001) that only return
   * normalized vectors at their full 3072-dim width.
   */
  async embed(text: string): Promise<number[]> {
    const response = await this.ai.models.embedContent({
      model: env.GEMINI_EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: env.EMBEDDING_DIMENSIONS },
    });

    const values = response.embeddings?.[0]?.values;
    if (!values?.length) {
      throw new Error('Embedding API returned no vector.');
    }
    return values.length === 3072 ? values : normalize(values);
  }

  /** Extract structured wellbeing metrics via JSON-constrained generation. */
  async analyze(content: string): Promise<JournalAnalysis> {
    const response = await this.ai.models.generateContent({
      model: env.GEMINI_CHAT_MODEL,
      contents:
        'You are a wellbeing analyst (NOT a clinician and NOT a diagnostician). ' +
        'Read this student journal entry and extract structured wellbeing signals.\n\n' +
        `Entry: """${content}"""`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: analysisSchema,
        temperature: 0.4,
      },
    });

    if (!response.text) {
      throw new Error('Analysis API returned an empty response.');
    }
    return JSON.parse(response.text) as JournalAnalysis;
  }

  /**
   * Analyze a batch of entries longitudinally and produce a structured insight
   * report. Entries should be passed oldest-first for correct trend detection.
   */
  async generateInsightReport(entries: InsightEntry[]): Promise<InsightReport> {
    const summary = entries
      .map(
        (e, i) =>
          `Entry ${i + 1} (${e.createdAt}): stress=${e.moodMetrics.stressScore}, ` +
          `emotion=${e.moodMetrics.primaryEmotion}, triggers=[${e.moodMetrics.detectedTriggers.join(', ')}]\n` +
          `"${e.content.slice(0, 300)}"`,
      )
      .join('\n\n');

    const response = await this.ai.models.generateContent({
      model: env.GEMINI_CHAT_MODEL,
      contents:
        'You are a wellbeing analyst reviewing a student\'s journal entries over the past 1–2 weeks. ' +
        'Identify longitudinal patterns, NOT individual incidents. ' +
        'Base every finding strictly on what is written — do not infer or assume.\n\n' +
        `Entries (oldest first):\n${summary}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: insightSchema,
        temperature: 0.3,
      },
    });

    if (!response.text) throw new Error('Insight API returned an empty response.');
    const raw = JSON.parse(response.text) as InsightReport;

    // Clamp stressTrend to the valid enum in case the model drifts.
    const validTrends = ['improving', 'stable', 'worsening'] as const;
    if (!validTrends.includes(raw.stressTrend)) raw.stressTrend = 'stable';
    return raw;
  }

  /**
   * Stream an empathetic, RAG-grounded companion reply. `history` is the set of
   * the student's own semantically similar past entries used as long-term memory.
   */
  streamCompanionReply(content: string, history: SimilarEntry[]) {
    const systemInstruction =
      'You are ZenGuardian, a warm, grounded wellbeing companion for students preparing for ' +
      'high-stakes entrance exams (NEET, JEE, CAT, UPSC, GATE). Guidelines:\n' +
      '- Be brief, human, and specific — 2 to 4 short sentences.\n' +
      "- When relevant, gently reference the student's own recurring patterns from their history.\n" +
      '- Never diagnose, never claim to be a therapist, never suggest medication.\n' +
      '- If the entry suggests self-harm, hopelessness, or crisis, calmly and clearly encourage ' +
      'reaching out to a trusted person or a helpline immediately.\n\n' +
      `The student's most semantically similar past entries (for context only): ${JSON.stringify(history)}`;

    return this.ai.models.generateContentStream({
      model: env.GEMINI_CHAT_MODEL,
      contents: `Today's entry: """${content}""". Respond with grounded, contextual support.`,
      config: { systemInstruction, temperature: 0.8 },
    });
  }
}

/** Singleton — one client, reused across requests. */
export const geminiService = new GeminiService();
