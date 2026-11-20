import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, LogIn, LogOut as LogOutIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  EMPLOYEE_STATUS_META,
  formatIndonesianDate,
  formatShortDate,
  formatTimeOnly,
  getCurrentMonthPrefix,
  getTodayIsoDate,
} from '../../lib/constants';
import type { EmployeeAttendance, EmployeeAttendanceStatus } from '../../types';

export function EmployeeAttendancePage() {
  const { profile } = useAuth();
  const today = getTodayIsoDate();

  const [now, setNow] = useState(() => new Date());
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthPrefix());
  const [todayRecord, setTodayRecord] = useState<EmployeeAttendance | null>(null);
  const [history, setHistory] = useState<EmployeeAttendance[]>([]);
  const [status, setStatus] = useState<EmployeeAttendanceStatus>('hadir');
  const [catatan, setCatatan] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = useCallback(async () => {
    if (!supabase || !profile) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const startMonth = `${selectedMonth}-01`;
      const [yearStr, monthStr] = selectedMonth.split('-');
      const endDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
      const endMonth = `${selectedMonth}-${String(endDay).padStart(2, '0')}`;

      const [{ data: todayData }, { data: historyData, error: histErr }] = await Promise.all([
        supabase
          .from('employee_attendance')
          .select('*')
          .eq('user_id', profile.id)
          .eq('tanggal', today)
          .maybeSingle(),
        supabase
          .from('employee_attendance')
          .select('*')
          .eq('user_id', profile.id)
          .gte('tanggal', startMonth)
          .lte('tanggal', endMonth)
          .order('tanggal', { ascending: false }),
      ]);

      if (histErr) {
        setFeedback({ type: 'error', text: histErr.message });
      }

      const typedToday = (todayData as EmployeeAttendance | null) ?? null;
      setTodayRecord(typedToday);
      if (typedToday) {
        setStatus(typedToday.status);
        setCatatan(typedToday.catatan || '');
      }
      setHistory((historyData as EmployeeAttendance[]) || []);
    } finally {
      setLoading(false);
    }
  }, [profile, selectedMonth, today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !profile) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from('employee_attendance').upsert(
        {
          user_id: profile.id,
          tanggal: today,
          jam_masuk: todayRecord?.jam_masuk || nowIso,
          status,
          catatan: catatan.trim() || null,
          updated_at: nowIso,
        },
        { onConflict: 'user_id,tanggal' },
      );

      if (error) {
        setFeedback({ type: 'error', text: `Gagal menyimpan absensi: ${error.message}` });
        return;
      }

      setFeedback({ type: 'success', text: 'Absensi masuk berhasil dicatat.' });
      await loadData();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckOut() {
    if (!supabase || !profile || !todayRecord) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('employee_attendance')
        .update({
          jam_pulang: nowIso,
          catatan: catatan.trim() || todayRecord.catatan,
          updated_at: nowIso,
        })
        .eq('id', todayRecord.id);

      if (error) {
        setFeedback({ type: 'error', text: `Gagal mencatat jam pulang: ${error.message}` });
        return;
      }

      setFeedback({ type: 'success', text: 'Jam pulang berhasil dicatat.' });
      await loadData();
    } finally {
      setSubmitting(false);
    }
  }

  const formattedClock = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  return (
    <div className="space-y-6">
      {/* Top Grid: Live Clock & Self-Service Form */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Live Clock & Today's Status Card */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6 lg:col-span-5">
          <p className="text-xs font-semibold text-red-600">Waktu Kehadiran Real-Time</p>
          <p className="mt-3 font-mono text-4xl font-bold tracking-tight text-neutral-900 tabular-nums">
            {formattedClock}
          </p>
          <p className="mt-1 text-sm text-neutral-600">{formatIndonesianDate(today)}</p>

          <div className="mt-6 space-y-3 border-t border-neutral-200 pt-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Status Hari Ini</span>
              <span className="font-semibold text-neutral-900">
                {todayRecord ? EMPLOYEE_STATUS_META[todayRecord.status].label : 'Belum Absen'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Jam Masuk</span>
              <span className="font-mono font-semibold text-neutral-900 tabular-nums">
                {formatTimeOnly(todayRecord?.jam_masuk ?? null)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Jam Pulang</span>
              <span className="font-mono font-semibold text-neutral-900 tabular-nums">
                {formatTimeOnly(todayRecord?.jam_pulang ?? null)}
              </span>
            </div>
          </div>
        </div>

        {/* Self-Service Attendance Action Card */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6 lg:col-span-7">
          <h2 className="text-lg font-bold text-neutral-900">Absensi Mandiri Karyawan</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Seluruh Administrator, Guru, dan Tenaga Kependidikan wajib mencatat kehadiran harian di
            halaman ini.
          </p>

          {feedback && (
            <div
              className={`mt-4 rounded-lg border p-3.5 text-sm ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <form onSubmit={handleCheckIn} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Status Kehadiran
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(EMPLOYEE_STATUS_META) as EmployeeAttendanceStatus[]).map((key) => {
                  const active = status === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatus(key)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                        active
                          ? 'border-red-600 bg-red-600 text-white'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      {EMPLOYEE_STATUS_META[key].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="emp-note" className="block text-sm font-medium text-neutral-700">
                Catatan / Keterangan (Opsional)
              </label>
              <textarea
                id="emp-note"
                rows={2}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Contoh: Hadir piket pagi, atau keterangan izin/dinas luar..."
                className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/15"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <LogIn className="h-4 w-4" />
                <span>
                  {submitting
                    ? 'Menyimpan...'
                    : todayRecord
                      ? 'Perbarui Absen Masuk'
                      : 'Catat Jam Masuk'}
                </span>
              </button>

              {todayRecord && !todayRecord.jam_pulang && todayRecord.status === 'hadir' && (
                <button
                  type="button"
                  onClick={handleCheckOut}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <LogOutIcon className="h-4 w-4 text-red-600" />
                  <span>Catat Jam Pulang</span>
                </button>
              )}

              {todayRecord?.jam_pulang && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Absensi hari ini telah selesai
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Personal Attendance History Table */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 px-6 py-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-bold text-neutral-900">Riwayat Absensi Pribadi</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              Catatan kehadiran Anda berdasarkan bulan terpilih
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="filter-month" className="text-xs font-medium text-neutral-600">
              Bulan:
            </label>
            <input
              id="filter-month"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-mono text-xs text-neutral-900 focus:border-red-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
              <tr>
                <th className="px-6 py-3">Tanggal</th>
                <th className="px-6 py-3">Jam Masuk</th>
                <th className="px-6 py-3">Jam Pulang</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-neutral-500">
                    Memuat riwayat absensi...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-neutral-500">
                    <Clock className="mx-auto mb-2 h-6 w-6 text-neutral-300" />
                    Belum ada riwayat absensi pada bulan ini.
                  </td>
                </tr>
              ) : (
                history.map((row) => {
                  const meta = EMPLOYEE_STATUS_META[row.status];
                  return (
                    <tr key={row.id} className="hover:bg-neutral-50">
                      <td className="px-6 py-3 font-medium text-neutral-900">
                        {formatShortDate(row.tanggal)}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-neutral-700 tabular-nums">
                        {formatTimeOnly(row.jam_masuk)}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-neutral-700 tabular-nums">
                        {formatTimeOnly(row.jam_pulang)}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-neutral-600">
                        {row.catatan || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
