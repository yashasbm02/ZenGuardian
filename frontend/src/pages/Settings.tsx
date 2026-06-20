import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';

export function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.exportData();
      if (!res.ok) throw new Error('Export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zenguardian-export.json';
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ text: 'Export downloaded.', kind: 'ok' });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Export failed.', kind: 'err' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('This will permanently delete your account and all journal entries. Are you sure?')) return;
    if (!window.confirm('Last chance — this cannot be undone. Delete everything?')) return;
    setBusy(true);
    try {
      await api.deleteAccount();
      await logout();
    } catch (err) {
      setMsg({
        text: err instanceof ApiError ? err.message : 'Could not delete account.',
        kind: 'err',
      });
      setBusy(false);
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
          <button className="link" onClick={() => navigate('/')}>← Dashboard</button>
        </div>
      </header>

      <main style={{ maxWidth: 520 }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Your Data</h2>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.4rem' }}>Export</h3>
          <p className="muted small" style={{ marginBottom: '1rem' }}>
            Download all your journal entries and mood metrics as a JSON file.
            Embeddings (raw vectors) are excluded.
          </p>
          <button className="primary" onClick={handleExport} disabled={busy}>
            Download my data
          </button>
        </div>

        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--line)' }}>
          <h3 style={{ marginBottom: '0.4rem' }}>Account</h3>
          <p className="muted small" style={{ marginBottom: '1rem' }}>
            Signed in as <strong>{user?.email}</strong>. Deleting your account
            permanently removes all journals and cannot be undone.
          </p>
          <button
            style={{
              background: 'var(--severe)',
              color: '#fff',
              border: 'none',
              padding: '0.65rem 1.25rem',
              borderRadius: '999px',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
            onClick={handleDeleteAccount}
            disabled={busy}
          >
            Delete my account
          </button>
        </div>

        {msg && (
          <div className={`card banner ${msg.kind === 'err' ? 'error' : ''}`}
            style={msg.kind === 'ok' ? { borderColor: 'var(--calm)', color: 'var(--calm)' } : undefined}>
            {msg.text}
          </div>
        )}
      </main>
    </div>
  );
}
