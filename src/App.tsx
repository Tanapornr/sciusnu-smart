// ================================================================
// App.tsx
// FIX Vuln 1: On mount, verify the session token with the backend.
// If the server rejects it, clear the session immediately.
// ================================================================
import { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { applyAuthenticatedPage, applyPageScope } from './lib/theme';
import { getToken, apiGetSession, clearToken } from './services/api';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import AdvisorDashboard from './pages/AdvisorDashboard';
import ViewerDashboard from './pages/ViewerDashboard';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  const { isAuthenticated, user, restoreSession } = useAuthStore();
  const [verifying, setVerifying] = useState(() => Boolean(getToken()));

  // Restore in-memory auth only after the backend verifies the token.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setVerifying(false);
      return;
    }

    let cancelled = false;
    setVerifying(true);
    apiGetSession()
      .then((session) => {
        if (!cancelled) restoreSession(session);
      })
      .catch(() => {
        if (!cancelled) clearToken();
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });

    return () => {
      cancelled = true;
    };
  }, [restoreSession]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      applyPageScope('page-login');
    } else {
      applyAuthenticatedPage(user.role);
    }
  }, [isAuthenticated, user]);

  if (verifying) return null;

  if (!isAuthenticated || !user) {
    return <Login />;
  }

  switch (user.role) {
    case 'student':
      return <StudentDashboard />;
    case 'advisor':
    case 'advisor_main':
      return <AdvisorDashboard />;
    case 'viewer':
      return <ViewerDashboard />;
    case 'admin':
      return <AdminDashboard />;
    default:
      return <Login />;
  }
}

export default App;
