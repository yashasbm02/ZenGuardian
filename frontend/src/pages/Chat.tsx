import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, streamChat } from '../api/client';
import type { ChatMessage } from '../types';
import { ThemeToggle } from '../components/ThemeToggle';

const QUICK_ACTIONS = [
  'Calm me down',
  'Motivate me',
  'Guide me through breathing',
  "I'm overwhelmed",
];

export function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streamingReply, setStreamingReply] = useState('');
  const [crisis, setCrisis] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .getChatHistory()
      .then(({ messages }) => setMessages(messages))
      .catch(() => setMessages([]))
      .finally(() => setLoaded(true));
  }, []);

  // Auto-scroll to the newest content.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingReply]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;

    setBusy(true);
    setCrisis(null);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setStreamingReply('');

    let full = '';
    try {
      await streamChat(message, (event) => {
        switch (event.type) {
          case 'token':
            full += event.data;
            setStreamingReply(full);
            break;
          case 'crisis':
            setCrisis(event.data);
            break;
          case 'error':
            full = full || 'Sorry, something went wrong. Please try again.';
            break;
          case 'done':
          default:
            break;
        }
      });
    } catch {
      full = full || 'Sorry, something went wrong. Please try again.';
    } finally {
      setMessages((prev) => [...prev, { role: 'assistant', content: full }]);
      setStreamingReply('');
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Clear this conversation? This cannot be undone.')) return;
    try {
      await api.clearChat();
      setMessages([]);
      setCrisis(null);
    } catch {
      // keep messages on failure
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const empty = loaded && messages.length === 0 && !streamingReply;

  return (
    <div className="app-shell chat-shell">
      <header className="topbar">
        <div className="brand-row">
          <span className="brand-mark">🛡️</span>
          <strong>Companion</strong>
        </div>
        <div className="topbar-right">
          <ThemeToggle />
          <button className="btn-ghost" onClick={() => navigate('/')}>← Dashboard</button>
          <button className="btn-ghost" onClick={() => void handleClear()}>Clear</button>
        </div>
      </header>

      <div className="chat-window">
        <div className="chat-messages" ref={scrollRef}>
          {empty && (
            <div className="chat-empty">
              <span className="brand-mark">💬</span>
              <h2>I'm here for you</h2>
              <p className="muted">
                Talk to me about anything — exam stress, motivation, or just how your day went.
                I remember our conversations and tailor support to you.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={m._id ?? i} className={`bubble-row ${m.role}`}>
              <div className={`bubble ${m.role}`}>{m.content}</div>
            </div>
          ))}

          {(streamingReply || busy) && (
            <div className="bubble-row assistant">
              <div className="bubble assistant">
                {streamingReply}
                {busy && <span className="cursor" />}
              </div>
            </div>
          )}

          {crisis && (
            <div className="card banner crisis" style={{ margin: '0.5rem 0' }}>
              <strong>You matter. 💛</strong>
              <p>{crisis}</p>
            </div>
          )}
        </div>

        <div className="chat-composer">
          <div className="quick-actions">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className="suggestion-chip"
                disabled={busy}
                onClick={() => void send(q)}
              >
                {q}
              </button>
            ))}
          </div>
          <form className="chat-input-row" onSubmit={submit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message your companion…"
              disabled={busy}
            />
            <button type="submit" className="primary" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
