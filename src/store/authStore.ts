// ================================================================
// Auth store — Zustand
// FIX Vuln 3: Sensitive auth state is no longer persisted to
//   localStorage. Only theme preference (non-sensitive) is saved.
//   The JWT token is kept in sessionStorage via api.ts (clearToken/
//   saveToken). On page reload the user must log in again.
// FIX Vuln 8: logout() calls apiLogout() to server-invalidate token.
// ================================================================
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { User, UserRole } from '../types';
import { storage, getDirectImageUrl, avatarFallback } from '../utils';
import { syncThemeClass } from '../lib/theme';
import { clearToken, apiLogout } from '../services/api';

interface AuthState {
  user: User | null;
  theme: 'light' | 'dark';
  isAuthenticated: boolean;

  // Actions
  login: (data: {
    email: string;
    name: string;
    role: UserRole;
    studentId: string;
    profileUrl: string;
  }) => void;
  restoreSession: (data: {
    email: string;
    name: string;
    role: UserRole;
    studentId: string;
    profileUrl?: string;
  }) => void;
  logout: () => void;
  updateProfile: (updates: Partial<Pick<User, 'profileUrl'>>) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  hydrate: () => void;
}

const THEME_KEY = 'theme'; // Only theme is persisted (non-sensitive)

function readSavedTheme(): 'light' | 'dark' {
  return storage.get(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

const savedTheme = readSavedTheme();
syncThemeClass(savedTheme);

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,           // Never restored from storage — must re-login
      theme: savedTheme,
      isAuthenticated: false,

      login: ({ email, name, role, studentId, profileUrl }) => {
        const directPic = getDirectImageUrl(profileUrl);
        const finalPic = directPic || avatarFallback(name);
        const user: User = { email, name, role, studentId, profileUrl: finalPic };
        set({ user, isAuthenticated: true });
      },

      restoreSession: ({ email, name, role, studentId, profileUrl = '' }) => {
        const directPic = getDirectImageUrl(profileUrl);
        const finalPic = directPic || avatarFallback(name);
        const user: User = { email, name, role, studentId, profileUrl: finalPic };
        set({ user, isAuthenticated: true });
      },

      logout: () => {
        // Server-side token invalidation (FIX Vuln 8)
        apiLogout().catch(() => {});
        // Client-side cleanup
        clearToken();
        set({ user: null, isAuthenticated: false });
      },

      updateProfile: (updates) => {
        const { user } = get();
        if (!user) return;
        set({ user: { ...user, ...updates } });
      },

      setTheme: (theme) => {
        storage.set(THEME_KEY, theme);
        syncThemeClass(theme);
        set({ theme });
      },

      toggleTheme: () => {
        const { theme } = get();
        get().setTheme(theme === 'dark' ? 'light' : 'dark');
      },

      hydrate: () => {
        const theme = readSavedTheme();
        syncThemeClass(theme);
        // Do not restore user from storage — re-login is required
        set({ theme });
      },
    }),
    {
      name: 'sciusnu-theme', // Store key is now theme-only
      storage: createJSONStorage(() => localStorage),
      // Only persist non-sensitive theme preference
      partialize: ({ theme }) => ({ theme }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<AuthState> | undefined;
        const theme = persistedState?.theme || current.theme;
        syncThemeClass(theme);
        return {
          ...current,
          theme,
          // Never restore user/isAuthenticated from storage
          user: null,
          isAuthenticated: false,
        };
      },
    },
  ),
);
