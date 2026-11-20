import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, CheckCircle2, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  EMPLOYEE_STATUS_META,
  ROLE_LABELS,
  STUDENT_STATUS_META,
  formatIndonesianDate,
  formatTimeOnly,
  getCurrentMonthPrefix,
  getTodayIsoDate,
} from '../../lib/constants';
import type { EmployeeAttendance, StudentAttendance } from '../../types';

export function DashboardPage() {
  const { profile } = useAuth();
  const today = getTodayIsoDate();
  const monthPrefix = getCurrentMonthPrefix();

  const [loading, setLoading] = useState(true);
  const [myTodayAttendance, setMyTodayAttendance] = useState<EmployeeAttendance | null>(null);
  const [myMonthCount, setMyMonthCount] = useState(0);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [presentEmployeesToday, setPresentEmployeesToday] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [presentStudentsToday, setPresentStudentsToday] = useState(0);
  const [recentEmployeeLogs, setRecentEmployeeLogs] = useState<EmployeeAttendance[]>([]);
  const [recentStudentLogs, setRecentStudentLogs] = useState<StudentAttendance[]>([]);

  const role = profile?.role || 'tenaga_kependidikan';

  useEffect(() => {
    let active = true;

    async function fetchDashboard() {
      if (!supabase || !profile) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // 1. Personal attendance today
        const { data: mineToday } = await supabase
          .from('employee_attendance')
          .select('*')
          .eq('user_id', profile.id)
          .eq('tanggal', today)
          .maybeSingle();

        // 2. Personal attendance this month
        const { count: monthTotal } = await supabase
          .from('employee_attendance')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .gte('tanggal', `${monthPrefix}-01`);

        if (!active) return;
        setMyTodayAttendance((mineToday as EmployeeAttendance | null) ?? null);
        setMyMonthCount(monthTotal ?? 0);

        // 3. Role-specific aggregate queries
        if (role === 'admin') {
          const [empCountRes, empTodayRes, stuCountRes, stuTodayRes, recentEmpRes] =
            await Promise.all([
              supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .eq('is_active', true),
              supabase
                .from('employee_attendance')
                .select('id', { count: 'exact', head: true })
                .eq('tanggal', today)
                .eq('status', 'hadir'),
              supabase
                .from('students')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'aktif'),
              supabase
                .from('student_attendance')
                .select('id', { count: 'exact', head: true })
                .eq('tanggal', today)
                .eq('status', 'hadir'),
              supabase
                .from('employee_attendance')
                .select('*, profiles(full_name, email, nip, role, jabatan)')
                .eq('tanggal', today)
                .order('created_at', { ascending: false })
                .limit(8),
            ]);

          if (!active) return;
          setTotalEmployees(empCountRes.count ?? 0);
          setPresentEmployeesToday(empTodayRes.count ?? 0);
          setTotalStudents(stuCountRes.count ?? 0);
          setPresentStudentsToday(stuTodayRes.count ?? 0);
          setRecentEmployeeLogs((recentEmpRes.data as EmployeeAttendance[]) || []);
        } else if (role === 'guru') {
          const [stuCountRes, stuTodayRes, recentStuRes] = await Promise.all([
            supabase
              .from('students')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'aktif'),
            supabase
              .from('student_attendance')
              .select('id', { count: 'exact', head: true })
              .eq('tanggal', today)
              .eq('status', 'hadir'),
            supabase
              .from('student_attendance')
              .select('*, students(nis, nama, kelas, jurusan)')
              .eq('tanggal', today)
              .order('created_at', { ascending: false })
              .limit(8),
          ]);

          if (!active) return;
          setTotalStudents(stuCountRes.count ?? 0);
          setPresentStudentsToday(stuTodayRes.count ?? 0);
          setRecentStudentLogs((recentStuRes.data as StudentAttendance[]) || []);
        } else {
          // Tenaga kependidikan: personal recent history
          const { data: myHistory } = await supabase
            .from('employee_attendance')
            .select('*')
            .eq('user_id', profile.id)
            .order('tanggal', { ascending: false })
            .limit(7);

          if (!active) return;
          setRecentEmployeeLogs((myHistory as EmployeeAttendance[]) || []);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchDashboard();
    return () => {
      active = false;
    };
  }, [profile, role, today, monthPrefix]);

  return (
    <div className="space-y-6">
      {/* Greeting & Today's Personal Status Banner */}
      <div className="flex flex-col justify-between gap-5 rounded-xl border border-neutral-200 bg-white p-6 md:flex-row md:items-center">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-neutral-500">
            <Calendar className="h-3.5 w-3.5 text-red-600" />
            <span>{formatIndonesianDate(today)}</span>
          </p>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
            Selamat datang, {profile?.full_name}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            {ROLE_LABELS[role]}
            {profile?.jabatan ? ` · ${profile.jabatan}` : ''}
            {profile?.nip ? ` · NIP ${profile.nip}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {myTodayAttendance ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <div>
                <p className="font-semibold text-emerald-900">
                  Absen Hari Ini: {EMPLOYEE_STATUS_META[myTodayAttendance.status].label}
                </p>
                <p className="font-mono text-xs text-emerald-700 tabular-nums">
                  Masuk {formatTimeOnly(myTodayAttendance.jam_masuk)} · Pulang{' '}
                  {formatTimeOnly(myTodayAttendance.jam_pulang)}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
              <Clock className="h-4 w-4 text-amber-700" />
              <span className="font-medium text-amber-900">Anda belum absen masuk hari ini</span>
            </div>
          )}

          <Link
            to="/app/absensi-karyawan"
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 whitespace-nowrap shrink-0"
          >
            <span>{myTodayAttendance ? 'Kelola Absen' : 'Absen Sekarang'}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Role-Specific KPI Strip */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="h-28 animate-pulse rounded-xl border border-neutral-200 bg-white p-5"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <p className="text-xs font-medium text-neutral-500">Status Absen Anda Hari Ini</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {myTodayAttendance
                ? EMPLOYEE_STATUS_META[myTodayAttendance.status].label
                : 'Belum Absen'}
            </p>
            <p className="mt-1 font-mono text-xs text-neutral-500 tabular-nums">
              Masuk: {formatTimeOnly(myTodayAttendance?.jam_masuk ?? null)}
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <p className="text-xs font-medium text-neutral-500">Kehadiran Anda Bulan Ini</p>
            <p className="mt-2 font-mono text-2xl font-bold text-red-600 tabular-nums">
              {myMonthCount} hari
            </p>
            <p className="mt-1 text-xs text-neutral-500">Tercatat pada sistem</p>
          </div>

          {(role === 'admin' || role === 'guru') && (
            <>
              <div className="rounded-xl border border-neutral-200 bg-white p-5">
                <p className="text-xs font-medium text-neutral-500">Siswa Aktif Terdaftar</p>
                <p className="mt-2 font-mono text-2xl font-bold text-neutral-900 tabular-nums">
                  {totalStudents}
                </p>
                <p className="mt-1 text-xs text-neutral-500">TKJ · DKV · AK · BC · MPLB · BD</p>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-5">
                <p className="text-xs font-medium text-neutral-500">Siswa Hadir Hari Ini</p>
                <p className="mt-2 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                  {presentStudentsToday}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Dari {totalStudents} siswa terdaftar
                </p>
              </div>
            </>
          )}

          {role === 'admin' && (
            <div className="rounded-xl border border-neutral-200 bg-white p-5 sm:col-span-2 lg:col-span-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-neutral-500">
                    Kehadiran Karyawan Hari Ini
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-neutral-900 tabular-nums">
                    {presentEmployeesToday} / {totalEmployees} Karyawan Hadir
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/app/rekap/karyawan"
                    className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-100"
                  >
                    Rekap Karyawan
                  </Link>
                  <Link
                    to="/app/users"
                    className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    Kelola Pengguna
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity Table per Role */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-neutral-900">
              {role === 'admin'
                ? 'Aktivitas Absensi Karyawan Hari Ini'
                : role === 'guru'
                  ? 'Aktivitas Absensi Siswa Hari Ini'
                  : 'Riwayat Absensi Pribadi Terakhir'}
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              Pembaruan langsung dari basis data Supabase
            </p>
          </div>
          {role === 'guru' && (
            <Link
              to="/app/absensi-siswa"
              className="text-xs font-semibold text-red-600 hover:text-red-700"
            >
              Input Absensi Siswa
            </Link>
          )}
        </div>

        <div className="overflow-x-auto">
          {role === 'guru' ? (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                <tr>
                  <th className="px-6 py-3">NIS</th>
                  <th className="px-6 py-3">Nama Siswa</th>
                  <th className="px-6 py-3">Kelas</th>
                  <th className="px-6 py-3">Jurusan</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {recentStudentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-neutral-500">
                      Belum ada absensi siswa yang dicatat untuk hari ini.
                    </td>
                  </tr>
                ) : (
                  recentStudentLogs.map((log) => {
                    const meta = STUDENT_STATUS_META[log.status];
                    return (
                      <tr key={log.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-3 font-mono text-xs text-neutral-600 tabular-nums">
                          {log.students?.nis || '-'}
                        </td>
                        <td className="px-6 py-3 font-medium text-neutral-900">
                          {log.students?.nama || '-'}
                        </td>
                        <td className="px-6 py-3 text-neutral-700">{log.students?.kelas || '-'}</td>
                        <td className="px-6 py-3 font-mono text-xs font-semibold text-red-700">
                          {log.students?.jurusan || '-'}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                <tr>
                  <th className="px-6 py-3">
                    {role === 'admin' ? 'Nama Karyawan' : 'Tanggal'}
                  </th>
                  {role === 'admin' && <th className="px-6 py-3">Peran</th>}
                  <th className="px-6 py-3">Jam Masuk</th>
                  <th className="px-6 py-3">Jam Pulang</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {recentEmployeeLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={role === 'admin' ? 5 : 4}
                      className="px-6 py-8 text-center text-sm text-neutral-500"
                    >
                      Belum ada catatan absensi karyawan.
                    </td>
                  </tr>
                ) : (
                  recentEmployeeLogs.map((log) => {
                    const meta = EMPLOYEE_STATUS_META[log.status];
                    return (
                      <tr key={log.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-3 font-medium text-neutral-900">
                          {role === 'admin'
                            ? log.profiles?.full_name || '-'
                            : formatIndonesianDate(log.tanggal)}
                        </td>
                        {role === 'admin' && (
                          <td className="px-6 py-3 text-xs text-neutral-600">
                            {log.profiles?.role ? ROLE_LABELS[log.profiles.role] : '-'}
                          </td>
                        )}
                        <td className="px-6 py-3 font-mono text-xs text-neutral-700 tabular-nums">
                          {formatTimeOnly(log.jam_masuk)}
                        </td>
                        <td className="px-6 py-3 font-mono text-xs text-neutral-700 tabular-nums">
                          {formatTimeOnly(log.jam_pulang)}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
