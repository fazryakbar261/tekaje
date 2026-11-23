import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getAppMode, initRuntimeConfig, supabase } from '../lib/supabase';
import { clearLocalToken, getLocalToken, setLocalToken } from '../lib/dataService';
import type { SystemHealth, UserProfile } from '../types';

export interface ActiveSession {
  access_token: string;
  user: {
    id: string;
    email?: string;
  };
}

interface AuthContextValue {
  session: ActiveSession | null;
  user: User | { id: string; email?: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  health: SystemHealth;
  appMode: 'supabase' | 'local';
  refreshHealth: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setLocalSession: (token: string, nextProfile: UserProfile) => void;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [user, setUser] = useState<User | { id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [appMode, setAppMode] = useState<'supabase' | 'local'>(getAppMode());
  const [health, setHealth] = useState<SystemHealth>({
    mode: getAppMode(),
    configured: true,
    hasServiceRole: false,
    tablesReady: false,
    userCount: 0,
  });

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = (await res.json()) as SystemHealth;
        setHealth(data);
        if (data.mode) setAppMode(data.mode);
      }
    } catch {
      // Ignore network errors during health check
    }
  }, []);

  const loadSupabaseUserProfile = useCallback(async (activeSession: Session | null) => {
    if (!activeSession || !supabase) {
      setProfile(null);
      return;
    }

    const { data: existingProfile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', activeSession.user.id)
      .maybeSingle();

    if (!error && existingProfile) {
      const typed = existingProfile as UserProfile;
      if (!typed.is_active) {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setAuthError('Akun Anda sedang dinonaktifkan. Hubungi Administrator sekolah.');
        return;
      }
      setProfile(typed);
      return;
    }

    try {
      const syncRes = await fetch('/api/auth/sync-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeSession.access_token}`,
        },
      });
      if (syncRes.ok) {
        const payload = (await syncRes.json()) as { profile: UserProfile };
        if (!payload.profile.is_active) {
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setProfile(null);
          setAuthError('Akun Anda sedang dinonaktifkan. Hubungi Administrator sekolah.');
          return;
        }
        setProfile(payload.profile);
        return;
      }
    } catch {
      // Fall through if server sync unavailable
    }

    const metaRole = activeSession.user.user_metadata?.role;
    const fallbackRole =
      metaRole === 'admin' || metaRole === 'guru' || metaRole === 'tenaga_kependidikan'
        ? metaRole
        : 'tenaga_kependidikan';

    setProfile({
      id: activeSession.user.id,
      email: activeSession.user.email || '',
      full_name:
        activeSession.user.user_metadata?.full_name ||
        activeSession.user.email?.split('@')[0] ||
        'Pengguna',
      nip: activeSession.user.user_metadata?.nip || null,
      jabatan: activeSession.user.user_metadata?.jabatan || null,
      role: fallbackRole,
      is_active: true,
      created_at: activeSession.user.created_at,
    });
  }, []);

  const setLocalSession = useCallback((token: string, nextProfile: UserProfile) => {
    setLocalToken(token);
    setSession({
      access_token: token,
      user: { id: nextProfile.id, email: nextProfile.email },
    });
    setUser({ id: nextProfile.id, email: nextProfile.email });
    setProfile(nextProfile);
    setAuthError(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (getAppMode() === 'local') {
      const token = getLocalToken();
      if (!token) return;
      const res = await fetch('/api/local/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { profile: UserProfile };
        setProfile(data.profile);
      }
      return;
    }

    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    await loadSupabaseUserProfile(data.session);
  }, [loadSupabaseUserProfile]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    async function init() {
      const detectedMode = await initRuntimeConfig();
      if (!mounted) return;
      setAppMode(detectedMode);
      await refreshHealth();

      if (detectedMode === 'local') {
        const token = getLocalToken();
        if (token) {
          try {
            const res = await fetch('/api/local/auth/me', {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok && mounted) {
              const payload = (await res.json()) as { profile: UserProfile };
              setSession({
                access_token: token,
                user: { id: payload.profile.id, email: payload.profile.email },
              });
              setUser({ id: payload.profile.id, email: payload.profile.email });
              setProfile(payload.profile);
            } else {
              clearLocalToken();
            }
          } catch {
            clearLocalToken();
          }
        }
        if (mounted) setLoading(false);
        return;
      }

      if (!supabase) {
        if (mounted) setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      setSession(
        data.session
          ? {
              access_token: data.session.access_token,
              user: { id: data.session.user.id, email: data.session.user.email },
            }
          : null,
      );
      setUser(data.session?.user ?? null);

      if (data.session) {
        await loadSupabaseUserProfile(data.session);
      }
      if (mounted) setLoading(false);

      const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!mounted) return;
        setSession(
          nextSession
            ? {
                access_token: nextSession.access_token,
                user: { id: nextSession.user.id, email: nextSession.user.email },
              }
            : null,
        );
        setUser(nextSession?.user ?? null);
        if (nextSession) {
          loadSupabaseUserProfile(nextSession).finally(() => {
            if (mounted) setLoading(false);
          });
        } else {
          setProfile(null);
          setLoading(false);
        }
      });

      unsubscribe = () => subscription.subscription.unsubscribe();
    }

    init();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [loadSupabaseUserProfile, refreshHealth]);

  const signOut = useCallback(async () => {
    clearLocalToken();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        authError,
        health,
        appMode,
        refreshHealth,
        refreshProfile,
        setLocalSession,
        signOut,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider');
  }
  return ctx;
}
