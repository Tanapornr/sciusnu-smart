// ================================================================
// Auth store — Zustand
// Persists session in localStorage (same keys as old HTML files)
// ================================================================
import { create } from 'zustand';
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
  hydrate: () => void; // restore from localStorage on app boot
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  theme: 'light',
  isAuthenticated: false,

  login: ({ email, name, role, studentId, profileUrl }) => {
    // Normalize profile picture exactly as the old index.html did
    const directPic = getDirectImageUrl(profileUrl);
    const finalPic = directPic || avatarFallback(name);

    const user: User = { email, name, role, studentId, profileUrl: finalPic };

    // Persist — same localStorage keys as old code
    storage.set('userEmail', email);
    storage.set('userRole', role);
    storage.set('userName', name);
    storage.set('profileUrl', finalPic);
    if (role === 'student') storage.set('studentId', studentId);

    set({ user, isAuthenticated: true });
  },

  logout: () => {
    storage.clear();
    set({ user: null, isAuthenticated: false });
  },

  updateProfile: (updates) => {
    const { user } = get();
    if (!user) return;
    const updated = { ...user, ...updates };
    if (updates.profileUrl) storage.set('profileUrl', updates.profileUrl);
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
    // Restore theme
    const savedTheme = (storage.get('theme') as 'light' | 'dark') || 'light';
    syncThemeClass(savedTheme);

    // Restore user session
    const role = storage.get('userRole') as UserRole | '';
    const email = storage.get('userEmail');
    const name = storage.get('userName');
    const studentId = storage.get('studentId');
    const profileUrl = storage.get('profileUrl');

    if (role && email && name) {
      set({
        user: { email, name, role, studentId, profileUrl },
        isAuthenticated: true,
        theme: savedTheme,
      });
    } else {
      set({ theme: savedTheme });
    }
  },
}));
