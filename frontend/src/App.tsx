import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Chat } from './pages/Chat';

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="centered">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={user ? <Dashboard /> : <Navigate to="/welcome" replace />}
      />
      <Route
        path="/welcome"
        element={user ? <Navigate to="/" replace /> : <AuthPage />}
      />
      <Route
        path="/settings"
        element={user ? <Settings /> : <Navigate to="/welcome" replace />}
      />
      <Route
        path="/chat"
        element={user ? <Chat /> : <Navigate to="/welcome" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
