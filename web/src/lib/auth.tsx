import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, TOKEN_KEY, USER_KEY, apiError } from './api';
import type { Role, User } from './types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  language?: string;
  village?: string;
  district?: string;
  state?: string;
  farm_name?: string;
  role?: 'farmer' | 'veterinarian';
  registration_no?: string;
  qualification?: string;
  clinic_name?: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const roleHome: Record<Role, string> = {
  farmer: '/farmer',
  veterinarian: '/vet',
  paravet: '/vet',
  cooperative: '/coop',
  admin: '/admin',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState<boolean>(Boolean(localStorage.getItem(TOKEN_KEY)));

  const clear = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const store = useCallback((accessToken: string, nextUser: User) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    localStorage.setItem('alg_lang', nextUser.language || 'en');
    setToken(accessToken);
    setUser(nextUser);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    try {
      const { data } = await api.get<User>('/auth/me');
      localStorage.setItem(USER_KEY, JSON.stringify(data));
      setUser(data);
    } catch (error) {
      if (!(error as { response?: { status?: number } })?.response?.status) {
        // Keep the cached session during a transient network failure.
        return;
      }
      clear();
    }
  }, [clear]);

  useEffect(() => {
    const handler = () => clear();
    window.addEventListener('alg:unauthorized', handler);
    return () => window.removeEventListener('alg:unauthorized', handler);
  }, [clear]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    refreshUser().finally(() => setLoading(false));
  }, [token, refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const { data } = await api.post<{ access_token: string; user: User }>('/auth/login', {
          email,
          password,
        });
        store(data.access_token, data.user);
        return data.user;
      } catch (error) {
        throw new Error(apiError(error));
      }
    },
    [store],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      try {
        const { data } = await api.post<{ access_token: string; user: User }>('/auth/register', payload);
        store(data.access_token, data.user);
        return data.user;
      } catch (error) {
        throw new Error(apiError(error));
      }
    },
    [store],
  );

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout: clear, refreshUser }),
    [user, token, loading, login, register, clear, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
