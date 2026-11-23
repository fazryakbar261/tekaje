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

export async function safeParseJson<T>(res: Response): Promise<{
  ok: boolean;
  data: (T & { error?: string }) | null;
  errorText: string | null;
}> {
  const raw = await res.text();
  if (!raw) {
    return {
      ok: res.ok,
      data: null,
      errorText: res.ok ? null : `Server merespons status HTTP ${res.status}.`,
    };
  }
  try {
    const parsed = JSON.parse(raw) as T & { error?: string };
    return {
      ok: res.ok,
      data: parsed,
      errorText: !res.ok ? parsed.error || `Permintaan gagal (HTTP ${res.status}).` : null,
    };
  } catch {
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
    return {
      ok: false,
      data: null,
      errorText: `Respons server bukan JSON (HTTP ${res.status}). Muat ulang halaman atau tunggu beberapa detik. (${snippet})`,
    };
  }
}

export async function initRuntimeConfig(force = false): Promise<'supabase' | 'local'> {
  if (initialized && !force) return runtimeMode;

  try {
    const res = await fetch('/api/config');
    const parsed = await safeParseJson<{
      mode: 'supabase' | 'local';
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    }>(res);

    if (parsed.ok && parsed.data) {
      const cfg = parsed.data;
      initialized = true;
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
    // Fallback to build-time env vars and allow retry
  }

  return runtimeMode;
}

