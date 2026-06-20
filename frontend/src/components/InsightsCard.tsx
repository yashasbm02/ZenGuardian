import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { InsightReport } from '../types';

const TREND_LABEL: Record<InsightReport['stressTrend'], string> = {
  improving: '↓ Improving',
  stable: '→ Stable',
  worsening: '↑ Worsening',
};

const TREND_CLASS: Record<InsightReport['stressTrend'], string> = {
  improving: 'calm',
  stable: 'moderate',
  worsening: 'severe',
};

export function InsightsCard({ entryCount }: { entryCount: number }) {
  const [report, setReport] = useState<InsightReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const load = async (bust = false) => {
    setLoading(true);
    try {
      const data = await api.getInsights(bust);
      setReport(data.report ?? null);
      setMessage(data.message ?? null);
      setGeneratedAt(data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : null);
    } catch {
      setMessage('Could not load insights.');
    } finally {
      setLoading(false);
    }
  };

  // Load once the user has enough entries.
  useEffect(() => {
    if (entryCount >= 3) void load();
  }, [entryCount]);

  if (entryCount < 3) return null;

  return (
    <div className="card insights">
      <div className="card-head">
        <button
          className="link"
          style={{ fontWeight: 650, fontSize: '1rem', color: 'var(--ink)', textDecoration: 'none' }}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '▾' : '▸'} Your Patterns
        </button>
        <button
          className="link"
          style={{ fontSize: '0.8rem' }}
          disabled={loading}
          onClick={() => void load(true)}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {open && (
        <>
          {loading && !report && <p className="muted small">Analyzing your entries…</p>}

          {message && !report && <p className="muted small">{message}</p>}

          {report && (
            <div className="insights-body">
              <div className="insight-row">
                <span className="muted small">Stress trend</span>
                <span className={`trend-badge ${TREND_CLASS[report.stressTrend]}`}>
                  {TREND_LABEL[report.stressTrend]}
                </span>
              </div>

              {report.recurringTriggers.length > 0 && (
                <div className="insight-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}>
                  <span className="muted small">Recurring triggers</span>
                  <div className="chips">
                    {report.recurringTriggers.map((t) => (
                      <span key={t} className="chip">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="insight-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="muted small">Focus this week</span>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>{report.weeklyFocus}</p>
              </div>

              {report.notablePatterns.length > 0 && (
                <div className="insight-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.3rem' }}>
                  <span className="muted small">Patterns to notice</span>
                  <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {report.notablePatterns.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {generatedAt && (
                <p className="muted small" style={{ marginTop: '0.5rem', textAlign: 'right' }}>
                  Generated at {generatedAt}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
