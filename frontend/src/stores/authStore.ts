import { create } from 'zustand';
import { bindAuthHandlers, apiGet, apiPost } from '@/api/client';
import type { AuthTokens, SanitizedUser } from '@/types';

const REFRESH_KEY = 'madarisk_refresh_token';

interface AuthState {
  user: SanitizedUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  bootstrapped: boolean;
  setSession: (tokens: AuthTokens) => void;
  clearSession: () => void;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: typeof localStorage !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null,
  bootstrapped: false,

  setSession: (tokens) => {
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    set({
      user: tokens.user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  },

  clearSession: () => {
    localStorage.removeItem(REFRESH_KEY);
    set({ user: null, accessToken: null, refreshToken: null });
  },

  bootstrap: async () => {
    const refresh = get().refreshToken || localStorage.getItem(REFRESH_KEY);
    if (!refresh) {
      set({ bootstrapped: true });
      return;
    }
    try {
      const data = await apiPost<AuthTokens>('/auth/refresh', { refreshToken: refresh });
      get().setSession(data);
      const me = await apiGet<SanitizedUser>('/auth/me');
      set({ user: me, bootstrapped: true });
    } catch {
      get().clearSession();
      set({ bootstrapped: true });
    }
  },

  login: async (email, password) => {
    const data = await apiPost<AuthTokens>('/auth/login', { email, password });
    get().setSession(data);
  },

  register: async (payload) => {
    await apiPost('/auth/register', payload);
  },

  logout: async () => {
    const refreshToken = get().refreshToken;
    try {
      if (refreshToken) {
        await apiPost('/auth/logout', { refreshToken });
      }
    } catch {
      // ignore
    } finally {
      get().clearSession();
    }
  },
}));

bindAuthHandlers({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem(REFRESH_KEY, refreshToken);
    useAuthStore.setState({ accessToken, refreshToken });
  },
  onLogout: () => useAuthStore.getState().clearSession(),
});
