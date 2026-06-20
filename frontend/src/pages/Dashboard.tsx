import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, streamJournalEntry } from '../api/client';
import type { JournalEntry, MoodMetrics } from '../types';
import { AnalysisCard } from '../components/AnalysisCard';
import { StressTrend } from '../components/StressTrend';
import { InsightsCard } from '../components/InsightsCard';

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [analysis, setAnalysis] = useState<MoodMetrics | null>(null);
  const [crisis, setCrisis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const replyRef = useRef<HTMLDivElement>(null);

  const loadEntries = () =>
    api
      .listEntries()
      .then(({ entries }) => setEntries(entries))
      .catch(() => setEntries([]));

  useEffect(() => {
    void loadEntries();
  }, []);

  useEffect(() => {
    replyRef.current?.scrollTo({ top: replyRef.current.scrollHeight });
  }, [reply]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (content.trim().length < 10 || busy) return;

    setBusy(true);
    setReply('');
    setAnalysis(null);
    setCrisis(null);
    setError(null);

    try {
      await streamJournalEntry(content, (event) => {
        switch (event.type) {
          case 'analysis':
            setAnalysis(event.data.moodMetrics);
            break;
          case 'token':
            setReply((prev) => prev + event.data);
            break;
          case 'crisis':
            setCrisis(event.data);
            break;
          case 'error':
            setError(event.data);
            break;
          case 'done':
            break;
        }
      });
      setContent('');
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your entry.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!window.confirm('Remove this entry? It will also be excluded from your AI context.')) return;
    setDeletingId(id);
    try {
      await api.deleteEntry(id);
      setEntries((prev) => prev.filter((e) => e._id !== id));
    } catch {
      // silent — entry stays in list
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-row">
          <span className="brand-mark">🛡️</span>
          <strong>ZenGuardian</strong>
        </div>
        <div className="topbar-right">
          <span className="muted small">{user?.email}</span>
          <button className="link" onClick={() => navigate('/settings')}>Settings</button>
          <button className="link" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>

      <main className="grid">
        <section className="col-main">
          <form className="card composer" onSubmit={submit}>
            <h2>How are you feeling right now?</h2>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write about your study day, mock scores, sleep, pressure — whatever's on your mind."
              rows={6}
              disabled={busy}
            />
            <div className="composer-foot">
              <span className="muted small">{content.trim().length} characters</span>
              <button
                type="submit"
                className="primary"
                disabled={busy || content.trim().length < 10}
              >
                {busy ? 'Reflecting…' : 'Check in'}
              </button>
            </div>
          </form>

          {error && <div className="card banner error">{error}</div>}

          {crisis && (
            <div className="card banner crisis">
              <strong>You matter. 💛</strong>
              <p>{crisis}</p>
            </div>
          )}

          {analysis && <AnalysisCard metrics={analysis} />}

          {(reply || busy) && (
            <div className="card companion">
              <div className="card-head">
                <h3>ZenGuardian</h3>
                {busy && !reply && <span className="muted small">thinking…</span>}
              </div>
              <div className="reply" ref={replyRef}>
                {reply}
                {busy && <span className="cursor" />}
              </div>
            </div>
          )}
        </section>

        <aside className="col-side">
          <InsightsCard entryCount={entries.length} />
          <StressTrend entries={entries} />

          <div className="card history">
            <div className="card-head">
              <h3>Past check-ins</h3>
            </div>
            {entries.length === 0 ? (
              <p className="muted small">Your reflections will appear here.</p>
            ) : (
              <ul className="entry-list">
                {entries.map((e) => (
                  <li key={e._id} className="entry">
                    <div className="entry-head">
                      <span className="entry-emotion">{e.moodMetrics.primaryEmotion}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="muted small">
                          {new Date(e.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <button
                          className="entry-delete"
                          title="Remove entry"
                          disabled={deletingId === e._id}
                          onClick={() => void handleDeleteEntry(e._id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <p className="entry-content">{e.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
