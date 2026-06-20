import type { MoodMetrics } from '../types';

function stressLabel(score: number): string {
  if (score <= 3) return 'Low';
  if (score <= 6) return 'Moderate';
  if (score <= 8) return 'High';
  return 'Severe';
}

function stressClass(score: number): string {
  if (score <= 3) return 'calm';
  if (score <= 6) return 'moderate';
  if (score <= 8) return 'high';
  return 'severe';
}

export function AnalysisCard({ metrics }: { metrics: MoodMetrics }) {
  const pct = Math.round((metrics.stressScore / 10) * 100);

  return (
    <div className="card analysis" role="region" aria-label="Mood Analysis Results" tabIndex={0}>
      <div className="analysis-head">
        <div>
          <span className="muted small">Primary emotion</span>
          <p className="emotion">{metrics.primaryEmotion}</p>
        </div>
        <div className={`stress-badge ${stressClass(metrics.stressScore)}`}>
          <span className="stress-num">{metrics.stressScore}/10</span>
          <span className="small">{stressLabel(metrics.stressScore)} stress</span>
        </div>
      </div>

      <div className="meter" aria-label={`Stress level ${metrics.stressScore} of 10`}>
        <div className={`meter-fill ${stressClass(metrics.stressScore)}`} style={{ width: `${pct}%` }} />
      </div>

      {metrics.detectedTriggers.length > 0 && (
        <div className="triggers">
          <span className="muted small">Triggers</span>
          <div className="chips">
            {metrics.detectedTriggers.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="coping">
        <span className="muted small">Try this</span>
        <p>{metrics.copingStrategy}</p>
      </div>
    </div>
  );
}
