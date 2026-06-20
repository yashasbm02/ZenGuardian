export interface User {
  id: string;
  email: string;
}

export interface MoodMetrics {
  stressScore: number;
  primaryEmotion: string;
  detectedTriggers: string[];
  copingStrategy: string;
}

export interface JournalEntry {
  _id: string;
  content: string;
  moodMetrics: MoodMetrics;
  createdAt: string;
}

/** Payload of the first SSE `analysis` event from POST /api/journal. */
export interface AnalysisEvent {
  id: string;
  moodMetrics: MoodMetrics;
  suggestions?: string[];
  createdAt: string;
}

export interface ChatMessage {
  _id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

export interface InsightReport {
  recurringTriggers: string[];
  stressTrend: 'improving' | 'stable' | 'worsening';
  weeklyFocus: string;
  notablePatterns: string[];
}

export interface InsightsResponse {
  report: InsightReport | null;
  cached: boolean;
  generatedAt?: string;
  message?: string;
}

export type StreamEvent =
  | { type: 'analysis'; data: AnalysisEvent }
  | { type: 'token'; data: string }
  | { type: 'crisis'; data: string }
  | { type: 'suggestions'; data: string[] }
  | { type: 'done'; data: null }
  | { type: 'error'; data: string };
