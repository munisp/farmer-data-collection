import { create } from 'zustand';
import type { User } from '@/types/models';
import { authService } from '@/services/auth';
import { apiClient } from '@/services/api/client';
import { database } from '@/services/database';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.login(email, password);
      await authService.saveTokens(response.tokens);
      await authService.saveUser(response.user);
      set({ user: response.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
      throw error;
    }
  },

  register: async (email: string, password: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.register(email, password, name);
      await authService.saveTokens(response.tokens);
      await authService.saveUser(response.user);
      set({ user: response.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authService.logout();
      await database.clearAll();
      set({ user: null, isAuthenticated: false, isLoading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
    }
  },

  loadUser: async () => {
    set({ isLoading: true });
    try {
      const user = await authService.getUser();
      const isAuthenticated = await authService.isAuthenticated();
      set({ user, isAuthenticated, isLoading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
