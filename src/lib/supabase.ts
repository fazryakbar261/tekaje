import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

let runtimeUrl = import.meta.env.VITE_SUPABASE_URL || '';
let runtimeAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
let runtimeMode: 'supabase' | 'local' = 'local';
let initialized = false;

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function checkConfigured(url: string, key: string): boolean {
  return isValidUrl(url) && key.length > 20 && !key.includes('your-supabase');
}

export let isSupabaseConfigured = checkConfigured(runtimeUrl, runtimeAnonKey);
if (isSupabaseConfigured) {
  runtimeMode = 'supabase';
}

export let supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(runtimeUrl, runtimeAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function getAppMode(): 'supabase' | 'local' {
  return runtimeMode;
}

export async function initRuntimeConfig(): Promise<'supabase' | 'local'> {
  if (initialized) return runtimeMode;
  initialized = true;

  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const cfg = (await res.json()) as {
        mode: 'supabase' | 'local';
        supabaseUrl?: string;
        supabaseAnonKey?: string;
      };
      runtimeMode = cfg.mode;

      if (
        cfg.mode === 'supabase' &&
        cfg.supabaseUrl &&
        cfg.supabaseAnonKey &&
        checkConfigured(cfg.supabaseUrl, cfg.supabaseAnonKey)
      ) {
        if (!supabase || runtimeUrl !== cfg.supabaseUrl) {
          runtimeUrl = cfg.supabaseUrl;
          runtimeAnonKey = cfg.supabaseAnonKey;
          isSupabaseConfigured = true;
          supabase = createClient(runtimeUrl, runtimeAnonKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
            },
          });
        }
      } else if (cfg.mode === 'local') {
        isSupabaseConfigured = false;
        supabase = null;
      }
    }
  } catch {
    // Fallback to build-time env vars
  }

  return runtimeMode;
}
