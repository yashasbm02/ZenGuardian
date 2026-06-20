import type { ChatMessage, InsightsResponse, JournalEntry, StreamEvent, User } from '../types';

/** Thrown for non-2xx JSON responses; carries the server's message + status. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? 'Request failed.');
  }
  return body as T;
}

export const api = {
  register: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: User }>('/api/auth/me'),

  listEntries: () => request<{ entries: JournalEntry[] }>('/api/journal'),

  deleteEntry: (id: string) =>
    request<void>(`/api/journal/${id}`, { method: 'DELETE' }),

  exportData: () => fetch('/api/user/export', { credentials: 'include' }),

  deleteAccount: () => request<void>('/api/user', { method: 'DELETE' }),

  getInsights: (bust = false) =>
    request<InsightsResponse>(`/api/journal/insights${bust ? '?refresh=true' : ''}`),

  getChatHistory: () => request<{ messages: ChatMessage[] }>('/api/chat'),

  clearChat: () => request<void>('/api/chat', { method: 'DELETE' }),
};

/**
 * POST JSON to an SSE endpoint and consume the stream. EventSource can't issue a
 * POST with a body, so we read the response stream by hand and split it on the
 * SSE `\n\n` frame boundary. Shared by both streaming endpoints.
 */
async function consumeSSE(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  fallbackError: string,
): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(res.status, errBody.error ?? fallbackError);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? ''; // keep any partial frame for the next read

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as StreamEvent);
      } catch {
        // ignore malformed/keep-alive frames
      }
    }
  }
}

/** Submit a journal entry and stream the analysis + companion reply. */
export function streamJournalEntry(
  content: string,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  return consumeSSE('/api/journal', { content }, onEvent, 'Could not submit your entry.');
}

/**
 * Ask a tapped follow-up ("explore") and stream the answer. This does NOT create
 * a journal entry — nothing is mood-scored or stored.
 */
export function streamExplore(
  question: string,
  context: string | undefined,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  return consumeSSE('/api/journal/explore', { question, context }, onEvent, 'Could not explore that.');
}

/** Send a message to the companion chatbot and stream its reply. */
export function streamChat(
  message: string,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  return consumeSSE('/api/chat', { message }, onEvent, 'Could not reach your companion.');
}
