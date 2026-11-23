import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Database,
  Eye,
  EyeOff,
  Lock,
  Mail,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAppMode, initRuntimeConfig, safeParseJson, supabase } from '../lib/supabase';
import type { UserProfile } from '../types';

interface BootstrapStatus {
  mode: 'supabase' | 'local';
  configured: boolean;
  hasServiceRole: boolean;
  tablesReady: boolean;
  canRegisterFirstAdmin: boolean;
}

export function LoginPage() {
  const navigate = useNavigate();
  const {
    session,
    loading,
    authError,
    clearAuthError,
    health,
    appMode,
    refreshHealth,
    setLocalSession,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'first-admin'>('login');
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [nip, setNip] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      navigate('/app', { replace: true });
    }
  }, [loading, session, navigate]);

  useEffect(() => {
    async function checkBootstrap() {
      try {
        const res = await fetch('/api/auth/bootstrap-status');
        const parsed = await safeParseJson<BootstrapStatus>(res);
        if (parsed.ok && parsed.data) {
          setBootstrap(parsed.data);
          if (parsed.data.canRegisterFirstAdmin) {
            setMode('first-admin');
          }
        }
      } catch {
        // Ignore network errors
      }
    }
    checkBootstrap();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    clearAuthError();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg('Email dan kata sandi wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const currentMode = await initRuntimeConfig(true);
      if (currentMode === 'local') {
        const res = await fetch('/api/local/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        });
        const parsed = await safeParseJson<{
          token?: string;
          profile?: UserProfile;
          error?: string;
        }>(res);

        if (!parsed.ok || !parsed.data?.token || !parsed.data?.profile) {
          setErrorMsg(parsed.errorText || 'Email atau kata sandi salah.');
          return;
        }

        setLocalSession(parsed.data.token, parsed.data.profile);
        navigate('/app', { replace: true });
        return;
      }

      if (!supabase) {
        setErrorMsg(
          'Konfigurasi Supabase belum tersedia. Pastikan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY telah diisi.',
        );
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes('invalid login credentials')) {
          setErrorMsg('Email atau kata sandi salah. Silakan periksa kembali.');
        } else {
          setErrorMsg(error.message);
        }
        return;
      }

      navigate('/app', { replace: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan saat masuk.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterFirstAdmin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!fullName.trim() || !email.trim() || password.length < 6) {
      setErrorMsg('Nama lengkap, email, dan kata sandi minimal 6 karakter wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const currentMode = await initRuntimeConfig(true);
      // If Supabase mode WITHOUT service role, use standard client signUp
      if (currentMode === 'supabase' && !bootstrap?.hasServiceRole && supabase) {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              nip: nip.trim() || null,
              role: 'admin',
            },
          },
        });
        if (signUpErr) {
          setErrorMsg(signUpErr.message);
          return;
        }
        if (data.session) {
          await refreshHealth();
          navigate('/app', { replace: true });
          return;
        }
        setSuccessMsg(
          'Akun Administrator berhasil didaftarkan. Periksa email verifikasi Anda lalu login.',
        );
        setMode('login');
        return;
      }

      const res = await fetch('/api/auth/bootstrap-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          nip: nip.trim() || undefined,
          jabatan: 'Administrator Sistem',
        }),
      });

      const parsed = await safeParseJson<{
        error?: string;
        message?: string;
        token?: string;
        profile?: UserProfile;
      }>(res);
      if (!parsed.ok || !parsed.data) {
        setErrorMsg(parsed.errorText || 'Gagal membuat akun Administrator pertama.');
        return;
      }

      const payload = parsed.data;
      if (getAppMode() === 'local' && payload.token && payload.profile) {
        setLocalSession(payload.token, payload.profile);
        await refreshHealth();
        navigate('/app', { replace: true });
        return;
      }

      if (supabase) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (!signInErr) {
          await refreshHealth();
          navigate('/app', { replace: true });
          return;
        }
      }

      setSuccessMsg('Akun Administrator pertama berhasil dibuat. Silakan login.');
      setMode('login');
      setBootstrap((prev) => (prev ? { ...prev, canRegisterFirstAdmin: false } : prev));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mendaftarkan admin.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopySql() {
    if (!health.schemaSql) return;
    navigator.clipboard.writeText(health.schemaSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  }

  const activeError = errorMsg || authError;

  return (
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-12">
      {/* Left Brand Panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-red-800 p-10 text-white lg:col-span-5 lg:flex">
        <img
          src="/src/assets/images/hero_smk_campus_1795061349747.jpg"
          alt="SMK Prima Unggul"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-multiply"
        />
        <div className="relative z-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-red-100 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Kembali ke Beranda</span>
          </Link>

          <div className="mt-10 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-sm font-extrabold text-red-700">
              PU
            </span>
            <div>
              <p className="text-lg font-bold tracking-tight">SMK Prima Unggul</p>
              <p className="text-xs text-red-100">Sistem Absensi Siswa &amp; Karyawan</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
            Portal Kedisiplinan &amp; Rekap Kehadiran Sekolah
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-red-100">
            Akses terintegrasi untuk Administrator, Guru, dan Tenaga Kependidikan di seluruh
            program keahlian TKJ, DKV, AK, BC, MPLB, dan BD.
          </p>
          <div className="mt-8 border-t border-red-400/30 pt-6 text-xs text-red-100">
            Pengguna pertama yang dibuat pada sistem secara otomatis ditetapkan sebagai
            Administrator untuk mengelola pengguna dan data siswa.
          </div>
        </div>
      </div>

      {/* Right Login Form Panel */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:col-span-7 lg:px-20">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-red-600"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Beranda</span>
            </Link>
            <span className="text-sm font-bold text-red-600">SMK Prima Unggul</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
            {mode === 'login' ? 'Masuk ke Portal Absensi' : 'Buat Akun Admin Pertama'}
          </h2>
          <p className="mt-1.5 text-sm text-neutral-600">
            {mode === 'login'
              ? 'Masukkan email dan kata sandi akun sekolah Anda untuk masuk ke dashboard.'
              : 'Belum ada pengguna terdaftar. Buat akun Administrator pertama untuk mulai menggunakan website.'}
          </p>

          {/* Segmented Toggle only when first user hasn't been created yet */}
          {bootstrap?.canRegisterFirstAdmin && (
            <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                }}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('first-admin');
                  setErrorMsg(null);
                }}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'first-admin'
                    ? 'bg-white text-red-700 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Daftar Admin Pertama
              </button>
            </div>
          )}

          {/* Local Mode / Supabase Status Card */}
          {appMode === 'local' ? (
            <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-700">
              <div className="flex items-start gap-2.5">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-neutral-900">
                    Database Relasional Lokal Aktif (Siap Login)
                  </p>
                  <p className="mt-1 leading-relaxed text-neutral-600">
                    Anda dapat langsung membuat akun Administrator dan login sekarang. Untuk
                    menghubungkan ke Supabase Cloud, isi{' '}
                    <code className="font-mono text-neutral-900">VITE_SUPABASE_URL</code>,{' '}
                    <code className="font-mono text-neutral-900">VITE_SUPABASE_ANON_KEY</code>, dan{' '}
                    <code className="font-mono text-neutral-900">SUPABASE_SERVICE_ROLE_KEY</code>{' '}
                    pada panel Secrets.
                  </p>
                  {health.schemaSql && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSql((prev) => !prev)}
                        className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 font-semibold text-neutral-800 hover:bg-neutral-100"
                      >
                        {showSql ? 'Tutup schema.sql' : 'Lihat schema.sql Supabase'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopySql}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1 font-semibold text-neutral-800 hover:bg-neutral-100"
                      >
                        {copiedSql ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span>{copiedSql ? 'Tersalin' : 'Salin schema.sql'}</span>
                      </button>
                    </div>
                  )}
                  {showSql && health.schemaSql && (
                    <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-neutral-200 bg-neutral-900 p-3 font-mono text-[11px] text-neutral-100">
                      {health.schemaSql}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          ) : (
            !health.tablesReady && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <div className="flex items-start gap-2.5">
                  <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Skema Tabel atau Hak Akses Supabase Belum Siap</p>
                    <p className="mt-1 text-amber-800">
                      Salin SQL berikut lalu jalankan di SQL Editor Supabase Dashboard Anda.
                    </p>
                    {bootstrap && (bootstrap as { error?: string }).error && (
                      <p className="mt-1.5 font-mono text-[11px] text-red-700">
                        Detail: {(bootstrap as { error?: string }).error}
                      </p>
                    )}
                    {health.schemaSql && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowSql((prev) => !prev)}
                          className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100"
                        >
                          {showSql ? 'Sembunyikan SQL Schema' : 'Lihat SQL Schema'}
                        </button>
                        <button
                          type="button"
                          onClick={handleCopySql}
                          className="inline-flex items-center gap-1 rounded-md bg-amber-900 px-2.5 py-1 font-semibold text-white hover:bg-amber-950"
                        >
                          {copiedSql ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          <span>{copiedSql ? 'Tersalin' : 'Salin schema.sql'}</span>
                        </button>
                      </div>
                    )}
                    {showSql && health.schemaSql && (
                      <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-amber-200 bg-neutral-900 p-3 font-mono text-[11px] text-neutral-100">
                        {health.schemaSql}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            )
          )}

          {activeError && (
            <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{activeError}</span>
            </div>
          )}

          {successMsg && (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800">
              {successMsg}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="mt-6 space-y-5">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-neutral-700">
                  Alamat Email
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@smkprimaunggul.sch.id"
                    className="w-full rounded-lg border border-neutral-300 bg-white py-2.5 pl-10 pr-3.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/15"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Kata Sandi
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    className="w-full rounded-lg border border-neutral-300 bg-white py-2.5 pl-10 pr-10 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Memverifikasi...' : 'Masuk ke Aplikasi'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterFirstAdmin} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="admin-fullname"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Nama Lengkap
                </label>
                <input
                  id="admin-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Contoh: Drs. Ahmad Fauzi"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/15"
                />
              </div>

              <div>
                <label htmlFor="admin-nip" className="block text-sm font-medium text-neutral-700">
                  NIP / ID Pegawai (Opsional)
                </label>
                <input
                  id="admin-nip"
                  type="text"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  placeholder="Contoh: 198501012010011001"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/15"
                />
              </div>

              <div>
                <label htmlFor="admin-email" className="block text-sm font-medium text-neutral-700">
                  Email Administrator
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@smkprimaunggul.sch.id"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/15"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Kata Sandi (Minimal 6 karakter)
                </label>
                <input
                  id="admin-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/15"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                <span>{submitting ? 'Membuat Akun Admin...' : 'Buat Akun Administrator'}</span>
              </button>
            </form>
          )}

          <p className="mt-8 text-xs text-neutral-500">
            Akun Guru dan Tenaga Kependidikan baru ditambahkan melalui menu{' '}
            <span className="font-medium text-neutral-700">User Management</span> oleh Administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
