// ================================================================
// App.tsx — Updated with petition tab support
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

// Global page context: 'main' | 'petitions'
export type PageView = 'main' | 'petitions';

function App() {
  const { isAuthenticated, user, restoreSession } = useAuthStore();
  const [verifying, setVerifying] = useState(() => Boolean(getToken()));
  const [pageView, setPageView] = useState<PageView>('main');

  useEffect(() => {
    const token = getToken();
    if (!token) { setVerifying(false); return; }

    let cancelled = false;
    setVerifying(true);
    apiGetSession()
      .then((session) => { if (!cancelled) restoreSession(session); })
      .catch(() => { if (!cancelled) clearToken(); })
      .finally(() => { if (!cancelled) setVerifying(false); });

    return () => { cancelled = true; };
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

  const props = { pageView, setPageView };

  switch (user.role) {
    case 'student':
      return <StudentDashboard {...props} />;
    case 'advisor_main':
      return <AdvisorDashboard {...props} />;
    case 'advisor':
    case 'viewer':
      return <ViewerDashboard {...props} />;
    case 'admin':
      return <AdminDashboard {...props} />;
    default:
      return <Login />;
  }
}

export default App;
