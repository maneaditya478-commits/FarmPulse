import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { ApiError, apiFetch, setAuthToken } from '../api/client';
import { clearActiveAccount, initDatabase, pendingCount, setActiveAccount } from '../db/database';
import { isNetworkError, syncPendingOperations, type SyncSummary } from '../offline/sync';
import type { User } from '../types';
import { useLanguage } from './LanguageContext';

const TOKEN_KEY = 'alg_mobile_token';
const USER_KEY = 'alg_mobile_user';

interface AuthValue {
  token: string | null;
  user: User | null;
  booting: boolean;
  online: boolean;
  pending: number;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshPending: () => Promise<void>;
  syncNow: () => Promise<SyncSummary>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLang } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const syncingRef = useRef(false);

  const refreshPending = useCallback(async () => {
    setPending(await pendingCount());
  }, []);

  const syncNow = useCallback(async (): Promise<SyncSummary> => {
    if (syncingRef.current) {
      return { applied: 0, duplicates: 0, conflicts: 0, errors: 0, photosUploaded: 0, results: [] };
    }
    syncingRef.current = true;
    try {
      const summary = await syncPendingOperations();
      setOnline(true);
      await refreshPending();
      return summary;
    } catch (error) {
      if (isNetworkError(error)) setOnline(false);
      await refreshPending();
      throw error;
    } finally {
      syncingRef.current = false;
    }
  }, [refreshPending]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await initDatabase();
      const [storedToken, storedUser] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);
      let parsedUser: User | null = null;
      if (storedUser) {
        try {
          parsedUser = JSON.parse(storedUser) as User;
        } catch {
          parsedUser = null;
        }
      }
      if (storedToken) {
        if (parsedUser) await setActiveAccount(parsedUser.id);
        setAuthToken(storedToken);
        if (mounted) {
          setToken(storedToken);
          setUser(parsedUser);
          if (parsedUser?.language === 'en' || parsedUser?.language === 'hi' || parsedUser?.language === 'mr') {
            await setLang(parsedUser.language);
          }
        }
        try {
          const fresh = await apiFetch<User>('/auth/me');
          if (mounted) {
            setUser(fresh);
            await SecureStore.setItemAsync(USER_KEY, JSON.stringify(fresh));
          }
          setOnline(true);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            setAuthToken(null);
            await SecureStore.deleteItemAsync(TOKEN_KEY);
            await SecureStore.deleteItemAsync(USER_KEY);
            await clearActiveAccount();
            if (mounted) {
              setToken(null);
              setUser(null);
              setPending(0);
            }
          } else if (isNetworkError(error)) {
            setOnline(false);
          }
        }
        await refreshPending();
      }
      if (mounted) setBooting(false);
    })();
    return () => {
      mounted = false;
    };
  }, [refreshPending, setLang]);

  useEffect(() => {
    if (!token) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshPending();
        syncNow().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [refreshPending, syncNow, token]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiFetch<{ access_token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), password },
      });
      setAuthToken(response.access_token);
      await SecureStore.setItemAsync(TOKEN_KEY, response.access_token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(response.user));
      await setActiveAccount(response.user.id);
      if (response.user.language === 'en' || response.user.language === 'hi' || response.user.language === 'mr') {
        await setLang(response.user.language);
      }
      setToken(response.access_token);
      setUser(response.user);
      setOnline(true);
      await refreshPending();
      syncNow().catch(() => undefined);
    },
    [refreshPending, setLang, syncNow],
  );

  const logout = useCallback(async () => {
    setAuthToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await clearActiveAccount();
    setToken(null);
    setUser(null);
    setPending(0);
  }, []);

  const refreshUser = useCallback(async () => {
    const fresh = await apiFetch<User>('/auth/me');
    setUser(fresh);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(fresh));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      token,
      user,
      booting,
      online,
      pending,
      login,
      logout,
      refreshUser,
      refreshPending,
      syncNow,
    }),
    [booting, login, logout, online, pending, refreshPending, refreshUser, syncNow, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
