// ================================================================
// App.tsx
// FIX Vuln 1: On mount, verify the session token with the backend.
//   If the server rejects it, the user is logged out immediately —
//   a tampered localStorage role cannot grant dashboard access.
// ================================================================
import { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { applyAuthenticatedPage, applyPageScope } from './lib/theme';
import { getToken, apiGetData, clearToken } from './services/api';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import AdvisorDashboard from './pages/AdvisorDashboard';
import ViewerDashboard from './pages/ViewerDashboard';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const [verifying, setVerifying] = useState(false);

  // On mount: if there's a token in sessionStorage, verify it with the
  // server by calling a protected endpoint. If it fails, clear the session.
  useEffect(() => {
    const token = getToken();
    if (token && isAuthenticated && user) {
      setVerifying(true);
      apiGetData()
        .catch(() => {
          // Server rejected the token — force logout
          clearToken();
          logout();
        })
        .finally(() => setVerifying(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthenticated || !user) {
      applyPageScope('page-login');
    } else {
      applyAuthenticatedPage(user.role);
    }
  }, [isAuthenticated, user]);

  if (verifying) return null; // brief flash while verifying

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
