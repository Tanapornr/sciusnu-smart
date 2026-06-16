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
import PetitionApproveByToken from './pages/PetitionApproveByToken';
import RequireStudentEmail from './components/auth/RequireStudentEmail';

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
    } else if (user.role === 'student' && (!user.email || !user.email.trim())) {
      // Email gate reuses the login screen's glass/background tokens
      applyPageScope('page-login');
    } else {
      applyAuthenticatedPage(user.role);
    }
  }, [isAuthenticated, user]);

  // ── Magic-link: show token page for anyone (no login required) ──
  const hasTokenInUrl = new URLSearchParams(window.location.search).has('petitionToken');
  if (hasTokenInUrl) {
    return <PetitionApproveByToken />;
  }

  if (verifying) return null;

  if (!isAuthenticated || !user) {
    return <Login />;
  }

  const props = { pageView, setPageView };

  switch (user.role) {
    case 'student':
      // Students must have an email on file before touching anything
      // else in the app — every notification (submission results,
      // petition approvals) is sent to this address.
      if (!user.email || !user.email.trim()) {
        return <RequireStudentEmail />;
      }
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