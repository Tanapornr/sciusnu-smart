// ================================================================
// Auth store - Zustand
// Persists session in localStorage and restores it before pages render.
// ================================================================
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { User, UserRole } from '../types';
import { storage, getDirectImageUrl, avatarFallback } from '../utils';
import { syncThemeClass } from '../lib/theme';

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
  logout: () => void;
  updateProfile: (updates: Partial<Pick<User, 'profileUrl'>>) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  hydrate: () => void;
}

const AUTH_STORAGE_KEYS = ['userEmail', 'userRole', 'userName', 'studentId', 'profileUrl'] as const;
const AUTH_STORE_KEY = 'sciusnu-auth';
const USER_ROLES: UserRole[] = ['student', 'admin', 'advisor_main', 'advisor', 'viewer'];

function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

function readSavedTheme(): 'light' | 'dark' {
  return storage.get('theme') === 'dark' ? 'dark' : 'light';
}

function readLegacyUser(): User | null {
  const role = storage.get('userRole');
  const email = storage.get('userEmail');
  const name = storage.get('userName') || email || 'User';

  if (!isUserRole(role) || !email) return null;

  const studentId = storage.get('studentId');
  const profileUrl = getDirectImageUrl(storage.get('profileUrl')) || avatarFallback(name);
  return { email, name, role, studentId, profileUrl };
}

function writeLegacyUser(user: User) {
  storage.set('userEmail', user.email);
  storage.set('userRole', user.role);
  storage.set('userName', user.name);
  storage.set('profileUrl', user.profileUrl);

  if (user.role === 'student') storage.set('studentId', user.studentId);
  else storage.remove('studentId');
}

function clearSavedAuth() {
  AUTH_STORAGE_KEYS.forEach((key) => storage.remove(key));
  storage.remove(AUTH_STORE_KEY);
}

const savedTheme = readSavedTheme();
const legacyUser = readLegacyUser();
syncThemeClass(savedTheme);

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: legacyUser,
      theme: savedTheme,
      isAuthenticated: Boolean(legacyUser),

      login: ({ email, name, role, studentId, profileUrl }) => {
        const directPic = getDirectImageUrl(profileUrl);
        const finalPic = directPic || avatarFallback(name);
        const user: User = { email, name, role, studentId, profileUrl: finalPic };

        writeLegacyUser(user);
        set({ user, isAuthenticated: true });
      },

      logout: () => {
        clearSavedAuth();
        set({ user: null, isAuthenticated: false });
      },

      updateProfile: (updates) => {
        const { user } = get();
        if (!user) return;

        const updated = { ...user, ...updates };
        writeLegacyUser(updated);
        set({ user: updated });
      },

      setTheme: (theme) => {
        storage.set('theme', theme);
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

        const user = get().user || readLegacyUser();
        if (user) {
          writeLegacyUser(user);
          set({ user, isAuthenticated: true, theme });
        } else {
          clearSavedAuth();
          set({ user: null, isAuthenticated: false, theme });
        }
      },
    }),
    {
      name: AUTH_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ user, theme, isAuthenticated }) => ({ user, theme, isAuthenticated }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<AuthState> | undefined;
        const user = persistedState?.user || current.user;
        const theme = persistedState?.theme || current.theme;

        syncThemeClass(theme);
        if (user) writeLegacyUser(user);

        return {
          ...current,
          ...persistedState,
          user,
          theme,
          isAuthenticated: Boolean(user),
        };
      },
    },
  ),
);
