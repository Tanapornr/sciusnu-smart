/**
 * Theme + page shell — only mutates <html> classList.
 * Visual output is 100% CSS variables in src/styles/tokens.css
 */

const PAGE_CLASSES = ['page-login', 'page-dashboard', 'page-admin'] as const;

export type PageScope = (typeof PAGE_CLASSES)[number];

export function syncThemeClass(theme: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
}

export function applyPageScope(scope: PageScope) {
  const root = document.documentElement;
  root.classList.remove(...PAGE_CLASSES);
  root.classList.add(scope);
}

export function applyAuthenticatedPage(role: string | undefined) {
  if (role === 'admin') {
    applyPageScope('page-dashboard');
    document.documentElement.classList.add('page-admin');
  } else {
    applyPageScope('page-dashboard');
    document.documentElement.classList.remove('page-admin');
  }
}

/** Run before React paint — matches authStore localStorage keys */
export function bootstrapThemeFromStorage() {
  const theme = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  syncThemeClass(theme);

  const role = localStorage.getItem('userRole');
  const email = localStorage.getItem('userEmail');
  if (role && email) {
    applyAuthenticatedPage(role);
  } else {
    applyPageScope('page-login');
  }
}
