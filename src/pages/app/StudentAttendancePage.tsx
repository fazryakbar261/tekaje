import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, Save, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  JURUSAN_LIST,
  STUDENT_STATUS_META,
  getTodayIsoDate,
} from '../../lib/constants';
import type { JurusanCode, Student, StudentAttendanceStatus } from '../../types';

interface AttendanceDraft {
  status: StudentAttendanceStatus;
  catatan: string;
}

export function StudentAttendancePage() {
  const { profile } = useAuth();
  const [tanggal, setTanggal] = useState(getTodayIsoDate());
  const [jurusanFilter, setJurusanFilter] = useState<'ALL' | JurusanCode>('ALL');
  const [kelasFilter, setKelasFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [students, setStudents] = useState<Student[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  const loadStudentsAndAttendance = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const [{ data: studentRows, error: stuErr }, { data: attRows, error: attErr }] =
        await Promise.all([
          supabase
            .from('students')
            .select('*, classes(id, nama_kelas, tingkat, jurusan_code)')
            .eq('status', 'aktif')
            .order('kelas', { ascending: true })
            .order('nama', { ascending: true }),
          supabase.from('student_attendance').select('*').eq('tanggal', tanggal),
        ]);

      if (stuErr) {
        setFeedback({ type: 'error', text: stuErr.message });
        return;
      }
      if (attErr) {
        setFeedback({ type: 'error', text: attErr.message });
        return;
      }

      const activeStudents = (studentRows as Student[]) || [];
      setStudents(activeStudents);

      const existingMap = new Map<string, { status: StudentAttendanceStatus; catatan: string }>();
      for (const row of attRows || []) {
        existingMap.set(row.student_id as string, {
          status: row.status as StudentAttendanceStatus,
          catatan: (row.catatan as string) || '',
        });
      }

      const nextDrafts: Record<string, AttendanceDraft> = {};
      for (const stu of activeStudents) {
        nextDrafts[stu.id] = existingMap.get(stu.id) || {
          status: 'hadir',
          catatan: '',
        };
      }
      setDrafts(nextDrafts);
    } finally {
      setLoading(false);
    }
  }, [tanggal]);

  useEffect(() => {
    loadStudentsAndAttendance();
  }, [loadStudentsAndAttendance]);

  const availableClasses = useMemo(() => {
    const filteredByJurusan =
      jurusanFilter === 'ALL'
        ? students
        : students.filter((s) => s.jurusan === jurusanFilter);
    return Array.from(new Set(filteredByJurusan.map((s) => s.kelas))).sort();
  }, [students, jurusanFilter]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (jurusanFilter !== 'ALL' && s.jurusan !== jurusanFilter) return false;
      if (kelasFilter !== 'ALL' && s.kelas !== kelasFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!s.nama.toLowerCase().includes(q) && !s.nis.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [students, jurusanFilter, kelasFilter, searchQuery]);

  function setStudentStatus(studentId: string, status: StudentAttendanceStatus) {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: {
        status,
        catatan: prev[studentId]?.catatan || '',
      },
    }));
  }

  function setStudentNote(studentId: string, catatan: string) {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: {
        status: prev[studentId]?.status || 'hadir',
        catatan,
      },
    }));
  }

  function markAllFilteredPresent() {
    setDrafts((prev) => {
      const copy = { ...prev };
      for (const stu of filteredStudents) {
        copy[stu.id] = {
          status: 'hadir',
          catatan: copy[stu.id]?.catatan || '',
        };
      }
      return copy;
    });
  }

  async function handleSaveAll() {
    if (!supabase || !profile || filteredStudents.length === 0) return;

    setSaving(true);
    setFeedback(null);
    try {
      const nowIso = new Date().toISOString();
      const payload = filteredStudents.map((stu) => {
        const draft = drafts[stu.id] || { status: 'hadir' as StudentAttendanceStatus, catatan: '' };
        return {
          student_id: stu.id,
          tanggal,
          status: draft.status,
          catatan: draft.catatan.trim() || null,
          recorded_by: profile.id,
          updated_at: nowIso,
        };
      });

      const { error } = await supabase
        .from('student_attendance')
        .upsert(payload, { onConflict: 'student_id,tanggal' });

      if (error) {
        setFeedback({ type: 'error', text: `Gagal menyimpan absensi siswa: ${error.message}` });
        return;
      }

      setFeedback({
        type: 'success',
        text: `Berhasil menyimpan absensi untuk ${payload.length} siswa pada tanggal ${tanggal}.`,
      });
    } finally {
      setSaving(false);
    }
  }

  const summaryCounts = useMemo(() => {
    const counts = { hadir: 0, sakit: 0, izin: 0, alpa: 0 };
    for (const stu of filteredStudents) {
      const st = drafts[stu.id]?.status || 'hadir';
      counts[st] += 1;
    }
    return counts;
  }, [filteredStudents, drafts]);

  return (
    <div className="space-y-6">
      {/* Controls & Filter Bar */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Input Absensi Siswa</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Pilih tanggal, jurusan, dan kelas untuk mencatat kehadiran siswa
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={markAllFilteredPresent}
              disabled={filteredStudents.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <CheckCheck className="h-4 w-4 text-emerald-600" />
              <span>Tandai Semua Hadir</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving || filteredStudents.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Absensi'}</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="att-date" className="block text-xs font-medium text-neutral-600">
              Tanggal Absensi
            </label>
            <input
              id="att-date"
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="att-jurusan" className="block text-xs font-medium text-neutral-600">
              Jurusan
            </label>
            <select
              id="att-jurusan"
              value={jurusanFilter}
              onChange={(e) => {
                setJurusanFilter(e.target.value as 'ALL' | JurusanCode);
                setKelasFilter('ALL');
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
            <label htmlFor="att-kelas" className="block text-xs font-medium text-neutral-600">
              Kelas
            </label>
            <select
              id="att-kelas"
              value={kelasFilter}
              onChange={(e) => setKelasFilter(e.target.value)}
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
            <label htmlFor="att-search" className="block text-xs font-medium text-neutral-600">
              Cari NIS / Nama
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                id="att-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari siswa..."
                className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Summary Counters */}
        <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
          <span>
            Ditampilkan:{' '}
            <strong className="font-mono text-neutral-900 tabular-nums">
              {filteredStudents.length}
            </strong>{' '}
            siswa
          </span>
          <span>
            Hadir:{' '}
            <strong className="font-mono text-emerald-700 tabular-nums">
              {summaryCounts.hadir}
            </strong>
          </span>
          <span>
            Sakit:{' '}
            <strong className="font-mono text-sky-700 tabular-nums">{summaryCounts.sakit}</strong>
          </span>
          <span>
            Izin:{' '}
            <strong className="font-mono text-amber-700 tabular-nums">{summaryCounts.izin}</strong>
          </span>
          <span>
            Alpa:{' '}
            <strong className="font-mono text-red-700 tabular-nums">{summaryCounts.alpa}</strong>
          </span>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border p-3.5 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Attendance Checklist Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
              <tr>
                <th className="px-5 py-3">NIS</th>
                <th className="px-5 py-3">Nama Siswa</th>
                <th className="px-5 py-3">Kelas · Jurusan</th>
                <th className="px-5 py-3">Status Kehadiran</th>
                <th className="px-5 py-3">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-neutral-500">
                    Memuat daftar siswa...
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-neutral-500">
                    {students.length === 0
                      ? 'Belum ada data siswa aktif. Administrator perlu menambahkan siswa di menu Data Siswa.'
                      : 'Tidak ada siswa yang sesuai dengan filter.'}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((stu) => {
                  const draft = drafts[stu.id] || {
                    status: 'hadir' as StudentAttendanceStatus,
                    catatan: '',
                  };
                  return (
                    <tr key={stu.id} className="hover:bg-neutral-50/70">
                      <td className="px-5 py-3 font-mono text-xs text-neutral-600 tabular-nums">
                        {stu.nis}
                      </td>
                      <td className="px-5 py-3 font-semibold text-neutral-900">{stu.nama}</td>
                      <td className="px-5 py-3 text-xs text-neutral-600">
                        {stu.kelas} · <span className="font-mono font-semibold text-red-700">{stu.jurusan}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="inline-flex rounded-lg bg-neutral-100 p-1">
                          {(Object.keys(STUDENT_STATUS_META) as StudentAttendanceStatus[]).map(
                            (stKey) => {
                              const active = draft.status === stKey;
                              const meta = STUDENT_STATUS_META[stKey];
                              return (
                                <button
                                  key={stKey}
                                  type="button"
                                  onClick={() => setStudentStatus(stu.id, stKey)}
                                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                                    active
                                      ? 'bg-red-600 text-white shadow-xs'
                                      : 'text-neutral-600 hover:text-neutral-900'
                                  }`}
                                >
                                  {meta.label}
                                </button>
                              );
                            },
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <input
                          type="text"
                          value={draft.catatan}
                          onChange={(e) => setStudentNote(stu.id, e.target.value)}
                          placeholder="Keterangan opsional"
                          className="w-full min-w-[160px] rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none"
                        />
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
