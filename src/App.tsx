import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import AdvisorDashboard from './pages/AdvisorDashboard';
import ViewerDashboard from './pages/ViewerDashboard';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  const { isAuthenticated, user, hydrate } = useAuthStore();

  // Restore session from localStorage on application start
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Page-level tokens (font scale, surfaces, Swal) via html classes only
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('page-login', 'page-dashboard', 'page-admin');

    if (!isAuthenticated || !user) {
      root.classList.add('page-login');
    } else {
      root.classList.add('page-dashboard');
      if (user.role === 'admin') {
        root.classList.add('page-admin');
      }
    }

    return () => {
      root.classList.remove('page-login', 'page-dashboard', 'page-admin');
    };
  }, [isAuthenticated, user]);

  // If not authenticated, force them to the login screen
  if (!isAuthenticated || !user) {
    return <Login />;
  }

  // Role-based routing system (Unified legacy flow)
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
      // Fallback in case of weird role values
      return <Login />;
  }
}

export default App;
