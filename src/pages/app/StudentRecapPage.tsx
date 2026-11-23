import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchStudentAttendanceRange, fetchStudents } from '../../lib/dataService';
import {
  JURUSAN_LIST,
  STUDENT_STATUS_META,
  downloadCsv,
  formatShortDate,
  getCurrentMonthPrefix,
  getTodayIsoDate,
} from '../../lib/constants';
import type { JurusanCode, Student, StudentAttendance } from '../../types';

interface AggregatedStudentRow {
  student: Student;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  total: number;
  percentage: number;
}

export function StudentRecapPage() {
  const { kelas: kelasParam } = useParams<{ kelas?: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();

  const monthPrefix = getCurrentMonthPrefix();
  const [startDate, setStartDate] = useState(`${monthPrefix}-01`);
  const [endDate, setEndDate] = useState(getTodayIsoDate());
  const [jurusanFilter, setJurusanFilter] = useState<'ALL' | JurusanCode>('ALL');
  const [kelasFilter, setKelasFilter] = useState<string>(
    kelasParam ? decodeURIComponent(kelasParam).replace(/-/g, ' ') : 'ALL',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'summary' | 'daily'>('summary');

  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<StudentAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (kelasParam) {
      setKelasFilter(decodeURIComponent(kelasParam).replace(/-/g, ' '));
    }
  }, [kelasParam]);

  const loadData = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const [stuData, attData] = await Promise.all([
        fetchStudents({ accessToken: session.access_token }),
        fetchStudentAttendanceRange({
          accessToken: session.access_token,
          startDate,
          endDate,
        }),
      ]);

      setStudents(stuData);
      setAttendanceLogs(attData);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat rekap siswa.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const availableClasses = useMemo(() => {
    const filtered =
      jurusanFilter === 'ALL' ? students : students.filter((s) => s.jurusan === jurusanFilter);
    return Array.from(new Set(filtered.map((s) => s.kelas))).sort();
  }, [students, jurusanFilter]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (jurusanFilter !== 'ALL' && s.jurusan !== jurusanFilter) return false;
      if (kelasFilter !== 'ALL' && s.kelas.toLowerCase() !== kelasFilter.toLowerCase()) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!s.nama.toLowerCase().includes(q) && !s.nis.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [students, jurusanFilter, kelasFilter, searchQuery]);

  const aggregatedRows: AggregatedStudentRow[] = useMemo(() => {
    const map = new Map<string, { hadir: number; sakit: number; izin: number; alpa: number }>();
    for (const log of attendanceLogs) {
      const curr = map.get(log.student_id) || { hadir: 0, sakit: 0, izin: 0, alpa: 0 };
      curr[log.status] += 1;
      map.set(log.student_id, curr);
    }

    return filteredStudents.map((stu) => {
      const counts = map.get(stu.id) || { hadir: 0, sakit: 0, izin: 0, alpa: 0 };
      const total = counts.hadir + counts.sakit + counts.izin + counts.alpa;
      const percentage = total > 0 ? Math.round((counts.hadir / total) * 100) : 0;
      return {
        student: stu,
        ...counts,
        total,
        percentage,
      };
    });
  }, [filteredStudents, attendanceLogs]);

  const filteredDailyLogs = useMemo(() => {
    const allowedIds = new Set(filteredStudents.map((s) => s.id));
    return attendanceLogs.filter((log) => allowedIds.has(log.student_id));
  }, [attendanceLogs, filteredStudents]);

  function handleKelasChange(val: string) {
    setKelasFilter(val);
    if (val === 'ALL') {
      navigate('/app/rekap/siswa', { replace: true });
    } else {
      navigate(`/app/rekap/siswa/${encodeURIComponent(val.replace(/\s+/g, '-'))}`, {
        replace: true,
      });
    }
  }

  function handleExportCsv() {
    if (viewMode === 'summary') {
      const headers = ['NIS', 'Nama Siswa', 'Kelas', 'Jurusan', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Total Pertemuan', 'Persentase Hadir (%)'];
      const rows = aggregatedRows.map((r) => [
        r.student.nis,
        r.student.nama,
        r.student.kelas,
        r.student.jurusan,
        r.hadir,
        r.sakit,
        r.izin,
        r.alpa,
        r.total,
        r.percentage,
      ]);
      downloadCsv(`rekap-siswa-ringkasan-${startDate}_${endDate}.csv`, headers, rows);
    } else {
      const headers = ['Tanggal', 'NIS', 'Nama Siswa', 'Kelas', 'Jurusan', 'Status', 'Catatan'];
      const rows = filteredDailyLogs.map((log) => [
        log.tanggal,
        log.students?.nis || '-',
        log.students?.nama || '-',
        log.students?.kelas || '-',
        log.students?.jurusan || '-',
        STUDENT_STATUS_META[log.status].label,
        log.catatan || '',
      ]);
      downloadCsv(`rekap-siswa-harian-${startDate}_${endDate}.csv`, headers, rows);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Rekap Absensi Siswa</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Pantau akumulasi kehadiran per siswa dan log harian berdasarkan rentang tanggal
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => setViewMode('summary')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'summary'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Ringkasan per Siswa
              </button>
              <button
                type="button"
                onClick={() => setViewMode('daily')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'daily'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Log Harian
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={
                viewMode === 'summary'
                  ? aggregatedRows.length === 0
                  : filteredDailyLogs.length === 0
              }
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4 text-red-600" />
              <span>Ekspor CSV</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="recap-stu-start" className="block text-xs font-medium text-neutral-600">
              Dari Tanggal
            </label>
            <input
              id="recap-stu-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="recap-stu-end" className="block text-xs font-medium text-neutral-600">
              Sampai Tanggal
            </label>
            <input
              id="recap-stu-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="recap-stu-jur" className="block text-xs font-medium text-neutral-600">
              Jurusan
            </label>
            <select
              id="recap-stu-jur"
              value={jurusanFilter}
              onChange={(e) => {
                setJurusanFilter(e.target.value as 'ALL' | JurusanCode);
                handleKelasChange('ALL');
              }}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
            >
              <option value="ALL">Semua Jurusan</option>
              {JURUSAN_LIST.map((j) => (
                <option key={j.code} value={j.code}>
                  {j.code} — {j.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="recap-stu-kls" className="block text-xs font-medium text-neutral-600">
              Kelas
            </label>
            <select
              id="recap-stu-kls"
              value={kelasFilter}
              onChange={(e) => handleKelasChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
            >
              <option value="ALL">Semua Kelas</option>
              {availableClasses.map((kls) => (
                <option key={kls} value={kls}>
                  {kls}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="recap-stu-search" className="block text-xs font-medium text-neutral-600">
              Cari NIS / Nama
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                id="recap-stu-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari siswa..."
                className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          {viewMode === 'summary' ? (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                <tr>
                  <th className="px-5 py-3">NIS</th>
                  <th className="px-5 py-3">Nama Siswa</th>
                  <th className="px-5 py-3">Kelas · Jurusan</th>
                  <th className="px-4 py-3 text-right">Hadir</th>
                  <th className="px-4 py-3 text-right">Sakit</th>
                  <th className="px-4 py-3 text-right">Izin</th>
                  <th className="px-4 py-3 text-right">Alpa</th>
                  <th className="px-5 py-3 text-right">Kehadiran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-neutral-500">
                      Memuat ringkasan absensi siswa...
                    </td>
                  </tr>
                ) : aggregatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-neutral-500">
                      Tidak ada data siswa yang sesuai dengan filter.
                    </td>
                  </tr>
                ) : (
                  aggregatedRows.map((row) => (
                    <tr key={row.student.id} className="hover:bg-neutral-50">
                      <td className="px-5 py-3 font-mono text-xs text-neutral-600 tabular-nums">
                        {row.student.nis}
                      </td>
                      <td className="px-5 py-3 font-semibold text-neutral-900">
                        {row.student.nama}
                      </td>
                      <td className="px-5 py-3 text-xs text-neutral-700">
                        <button
                          type="button"
                          onClick={() => handleKelasChange(row.student.kelas)}
                          className="hover:text-red-600 hover:underline"
                        >
                          {row.student.kelas}
                        </button>{' '}
                        · <span className="font-mono font-semibold text-red-700">{row.student.jurusan}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {row.hadir}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-sky-700 tabular-nums">
                        {row.sakit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-amber-700 tabular-nums">
                        {row.izin}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-red-700 tabular-nums">
                        {row.alpa}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-neutral-900 tabular-nums">
                        {row.total > 0 ? `${row.percentage}%` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                <tr>
                  <th className="px-5 py-3">Tanggal</th>
                  <th className="px-5 py-3">NIS</th>
                  <th className="px-5 py-3">Nama Siswa</th>
                  <th className="px-5 py-3">Kelas · Jurusan</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Dicatat Oleh</th>
                  <th className="px-5 py-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-neutral-500">
                      Memuat log absensi harian...
                    </td>
                  </tr>
                ) : filteredDailyLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-neutral-500">
                      Belum ada catatan absensi siswa pada rentang tanggal ini.
                    </td>
                  </tr>
                ) : (
                  filteredDailyLogs.map((log) => {
                    const meta = STUDENT_STATUS_META[log.status];
                    return (
                      <tr key={log.id} className="hover:bg-neutral-50">
                        <td className="px-5 py-3 font-medium text-neutral-900 whitespace-nowrap">
                          {formatShortDate(log.tanggal)}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-neutral-600 tabular-nums">
                          {log.students?.nis || '-'}
                        </td>
                        <td className="px-5 py-3 font-semibold text-neutral-900">
                          {log.students?.nama || '-'}
                        </td>
                        <td className="px-5 py-3 text-xs text-neutral-700">
                          {log.students?.kelas || '-'} ·{' '}
                          <span className="font-mono font-semibold text-red-700">
                            {log.students?.jurusan || '-'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-neutral-700">
                          {log.recorder?.full_name || '—'}
                        </td>
                        <td className="px-5 py-3 text-xs text-neutral-600">
                          {log.catatan || '—'}
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
