import type { JournalEntry } from '../types';

/** CSS-only sparkline of stress over the last entries (oldest → newest). */
export function StressTrend({ entries }: { entries: JournalEntry[] }) {
  if (entries.length < 2) return null;

  const points = [...entries].reverse().slice(-14); // chronological, last 14

  return (
    <div className="card trend">
      <div className="card-head">
        <h3>Stress trend</h3>
        <span className="muted small">last {points.length} check-ins</span>
      </div>
      <div className="bars">
        {points.map((e) => {
          const score = e.moodMetrics.stressScore;
          const cls = score <= 3 ? 'calm' : score <= 6 ? 'moderate' : score <= 8 ? 'high' : 'severe';
          return (
            <div
              key={e._id}
              className={`bar ${cls}`}
              style={{ height: `${(score / 10) * 100}%` }}
              title={`${new Date(e.createdAt).toLocaleDateString()} — ${score}/10`}
            />
          );
        })}
      </div>
    </div>
  );
}
