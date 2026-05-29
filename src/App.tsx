import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { applyAuthenticatedPage, applyPageScope } from './lib/theme';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import AdvisorDashboard from './pages/AdvisorDashboard';
import ViewerDashboard from './pages/ViewerDashboard';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  const { isAuthenticated, user, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      applyPageScope('page-login');
    } else {
      applyAuthenticatedPage(user.role);
    }
  }, [isAuthenticated, user]);

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
