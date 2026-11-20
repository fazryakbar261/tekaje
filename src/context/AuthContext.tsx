import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { SystemHealth, UserProfile } from '../types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  health: SystemHealth;
  refreshHealth: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [health, setHealth] = useState<SystemHealth>({
    configured: isSupabaseConfigured,
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
      }
    } catch {
      // Ignore network errors during health check
    }
  }, []);

  const loadUserProfile = useCallback(async (activeSession: Session | null) => {
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

    // Sync via server endpoint (auto-assigns admin role to the first user in Supabase Auth)
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

    // Fallback minimal profile from auth metadata if tables are ready without service role
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

  const refreshProfile = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    await loadUserProfile(data.session);
  }, [loadUserProfile]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      await refreshHealth();

      if (!supabase) {
        if (mounted) setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      setSession(data.session);
      setUser(data.session?.user ?? null);

      if (data.session) {
        await loadUserProfile(data.session);
      }
      if (mounted) setLoading(false);
    }

    init();

    if (!supabase) return;

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession) {
        loadUserProfile(nextSession).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadUserProfile, refreshHealth]);

  const signOut = useCallback(async () => {
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
        refreshHealth,
        refreshProfile,
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
