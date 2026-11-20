import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  EMPLOYEE_STATUS_META,
  ROLE_LABELS,
  downloadCsv,
  formatShortDate,
  formatTimeOnly,
  getCurrentMonthPrefix,
  getTodayIsoDate,
} from '../../lib/constants';
import type { EmployeeAttendance, UserRole } from '../../types';

export function EmployeeRecapPage() {
  const monthPrefix = getCurrentMonthPrefix();
  const [startDate, setStartDate] = useState(`${monthPrefix}-01`);
  const [endDate, setEndDate] = useState(getTodayIsoDate());
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [records, setRecords] = useState<EmployeeAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadRecap = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('employee_attendance')
        .select('*, profiles(full_name, email, nip, role, jabatan)')
        .gte('tanggal', startDate)
        .lte('tanggal', endDate)
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setRecords((data as EmployeeAttendance[]) || []);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadRecap();
  }, [loadRecap]);

  const filteredRecords = useMemo(() => {
    return records.filter((row) => {
      if (roleFilter !== 'ALL' && row.profiles?.role !== roleFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const name = row.profiles?.full_name?.toLowerCase() || '';
        const nip = row.profiles?.nip?.toLowerCase() || '';
        const email = row.profiles?.email?.toLowerCase() || '';
        if (!name.includes(q) && !nip.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [records, roleFilter, searchQuery]);

  const summary = useMemo(() => {
    const counts = { hadir: 0, izin: 0, sakit: 0, dinas_luar: 0 };
    for (const r of filteredRecords) {
      counts[r.status] += 1;
    }
    return counts;
  }, [filteredRecords]);

  function handleExportCsv() {
    const headers = [
      'Tanggal',
      'NIP',
      'Nama Karyawan',
      'Peran',
      'Jabatan',
      'Jam Masuk',
      'Jam Pulang',
      'Status',
      'Catatan',
    ];
    const rows = filteredRecords.map((r) => [
      r.tanggal,
      r.profiles?.nip || '-',
      r.profiles?.full_name || '-',
      r.profiles?.role ? ROLE_LABELS[r.profiles.role] : '-',
      r.profiles?.jabatan || '-',
      formatTimeOnly(r.jam_masuk),
      formatTimeOnly(r.jam_pulang),
      EMPLOYEE_STATUS_META[r.status].label,
      r.catatan || '',
    ]);
    downloadCsv(`rekap-absensi-karyawan-${startDate}_${endDate}.csv`, headers, rows);
  }

  return (
    <div className="space-y-6">
      {/* Filter Header */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Rekap Absensi Karyawan</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Laporan kehadiran Administrator, Guru, dan Tenaga Kependidikan
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRecords.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4 text-red-600" />
            <span>Ekspor CSV</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="recap-emp-start" className="block text-xs font-medium text-neutral-600">
              Dari Tanggal
            </label>
            <input
              id="recap-emp-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="recap-emp-end" className="block text-xs font-medium text-neutral-600">
              Sampai Tanggal
            </label>
            <input
              id="recap-emp-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="recap-emp-role" className="block text-xs font-medium text-neutral-600">
              Filter Peran
            </label>
            <select
              id="recap-emp-role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'ALL' | UserRole)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
            >
              <option value="ALL">Semua Peran</option>
              <option value="admin">Administrator</option>
              <option value="guru">Guru</option>
              <option value="tenaga_kependidikan">Tenaga Kependidikan</option>
            </select>
          </div>

          <div>
            <label htmlFor="recap-emp-search" className="block text-xs font-medium text-neutral-600">
              Cari Nama / NIP
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                id="recap-emp-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari karyawan..."
                className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-medium text-neutral-500">Total Hadir</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {summary.hadir}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-medium text-neutral-500">Total Izin</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">
            {summary.izin}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-medium text-neutral-500">Total Sakit</p>
          <p className="mt-1 font-mono text-2xl font-bold text-sky-700 tabular-nums">
            {summary.sakit}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-medium text-neutral-500">Total Dinas Luar</p>
          <p className="mt-1 font-mono text-2xl font-bold text-red-700 tabular-nums">
            {summary.dinas_luar}
          </p>
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
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
              <tr>
                <th className="px-5 py-3">Tanggal</th>
                <th className="px-5 py-3">Nama &amp; NIP</th>
                <th className="px-5 py-3">Peran</th>
                <th className="px-5 py-3">Jam Masuk</th>
                <th className="px-5 py-3">Jam Pulang</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-neutral-500">
                    Memuat rekap absensi karyawan...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-neutral-500">
                    Tidak ada catatan absensi karyawan pada rentang tanggal ini.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((row) => {
                  const meta = EMPLOYEE_STATUS_META[row.status];
                  return (
                    <tr key={row.id} className="hover:bg-neutral-50">
                      <td className="px-5 py-3 font-medium text-neutral-900 whitespace-nowrap">
                        {formatShortDate(row.tanggal)}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-neutral-900">
                          {row.profiles?.full_name || '-'}
                        </p>
                        <p className="font-mono text-xs text-neutral-500 tabular-nums">
                          {row.profiles?.nip ? `NIP ${row.profiles.nip}` : row.profiles?.email || '-'}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-xs text-neutral-700">
                        {row.profiles?.role ? ROLE_LABELS[row.profiles.role] : '-'}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-neutral-700 tabular-nums">
                        {formatTimeOnly(row.jam_masuk)}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-neutral-700 tabular-nums">
                        {formatTimeOnly(row.jam_pulang)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-neutral-600">
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
