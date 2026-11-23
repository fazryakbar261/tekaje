import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  Database,
  Edit2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import {
  deleteClassRoomById,
  deleteStudentById,
  fetchClassesAndTeachers,
  fetchStudentAttendanceByStudent,
  fetchStudents,
  saveClassRoom,
  saveStudent,
} from '../../lib/dataService';
import { JURUSAN_LIST, STUDENT_STATUS_META, formatShortDate } from '../../lib/constants';
import type {
  ClassRoom,
  DatabaseTableStatus,
  JurusanCode,
  Student,
  StudentAttendance,
  UserProfile,
} from '../../types';

interface StudentFormState {
  nis: string;
  nama: string;
  kelas: string;
  class_id: string;
  jurusan: JurusanCode;
  jenis_kelamin: 'L' | 'P';
  status: 'aktif' | 'nonaktif';
}

const INITIAL_FORM: StudentFormState = {
  nis: '',
  nama: '',
  kelas: '',
  class_id: '',
  jurusan: 'TKJ',
  jenis_kelamin: 'L',
  status: 'aktif',
};

interface ClassFormState {
  nama_kelas: string;
  tingkat: 'X' | 'XI' | 'XII';
  jurusan_code: JurusanCode;
  wali_kelas_id: string;
  tahun_ajaran: string;
}

const INITIAL_CLASS_FORM: ClassFormState = {
  nama_kelas: '',
  tingkat: 'X',
  jurusan_code: 'TKJ',
  wali_kelas_id: '',
  tahun_ajaran: '2026/2027',
};

export function StudentDataPage() {
  const { id: detailStudentId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [activeTab, setActiveTab] = useState<'students' | 'classes' | 'relations'>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [teachers, setTeachers] = useState<Pick<UserProfile, 'id' | 'full_name' | 'role'>[]>([]);

  const [jurusanFilter, setJurusanFilter] = useState<'ALL' | JurusanCode>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Student Modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formState, setFormState] = useState<StudentFormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Class Modal state
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRoom | null>(null);
  const [classForm, setClassForm] = useState<ClassFormState>(INITIAL_CLASS_FORM);
  const [savingClass, setSavingClass] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleteClassTarget, setDeleteClassTarget] = useState<ClassRoom | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Dynamic detail route state
  const [detailAttendance, setDetailAttendance] = useState<StudentAttendance[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Database relation inspection state
  const [dbStatus, setDbStatus] = useState<{
    hasDbUrl: boolean;
    tables: DatabaseTableStatus[];
    schemaSql: string;
  } | null>(null);
  const [loadingDbStatus, setLoadingDbStatus] = useState(false);
  const [seedingDb, setSeedingDb] = useState(false);
  const [migratingDb, setMigratingDb] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const loadAll = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const [stuList, clsResult] = await Promise.all([
        fetchStudents({ accessToken: session.access_token }),
        fetchClassesAndTeachers(session.access_token),
      ]);
      setStudents(stuList);
      setClasses(clsResult.classes);
      setTeachers(clsResult.teachers);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat data siswa dan kelas.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  const loadDbStatus = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingDbStatus(true);
    try {
      const res = await fetch('/api/admin/database-status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          hasDbUrl: boolean;
          tables: DatabaseTableStatus[];
          schemaSql: string;
        };
        setDbStatus(data);
      }
    } finally {
      setLoadingDbStatus(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (activeTab === 'relations') {
      loadDbStatus();
    }
  }, [activeTab, loadDbStatus]);

  // Load detail attendance when /app/data-siswa/:id is visited
  useEffect(() => {
    if (!detailStudentId || !session?.access_token) return;
    let active = true;
    setLoadingDetail(true);

    fetchStudentAttendanceByStudent({
      accessToken: session.access_token,
      studentId: detailStudentId,
    })
      .then((rows) => {
        if (!active) return;
        setDetailAttendance(rows);
        setLoadingDetail(false);
      })
      .catch(() => {
        if (active) setLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [detailStudentId, session?.access_token]);

  const selectedDetailStudent = useMemo(() => {
    if (!detailStudentId) return null;
    return students.find((s) => s.id === detailStudentId) || null;
  }, [detailStudentId, students]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (jurusanFilter !== 'ALL' && s.jurusan !== jurusanFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (
          !s.nama.toLowerCase().includes(q) &&
          !s.nis.toLowerCase().includes(q) &&
          !s.kelas.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [students, jurusanFilter, searchQuery]);

  function openAddModal() {
    setEditingStudent(null);
    const defaultClass = classes[0];
    setFormState({
      ...INITIAL_FORM,
      class_id: defaultClass?.id || '',
      kelas: defaultClass?.nama_kelas || '',
      jurusan: defaultClass?.jurusan_code || 'TKJ',
    });
    setFormError(null);
    setFormOpen(true);
  }

  function openEditModal(stu: Student) {
    setEditingStudent(stu);
    setFormState({
      nis: stu.nis,
      nama: stu.nama,
      kelas: stu.kelas,
      class_id: stu.class_id || '',
      jurusan: stu.jurusan,
      jenis_kelamin: stu.jenis_kelamin,
      status: stu.status,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function handleSelectClassInStudentForm(classId: string) {
    if (classId === '__custom__') {
      setFormState((prev) => ({ ...prev, class_id: '' }));
      return;
    }
    const found = classes.find((c) => c.id === classId);
    if (found) {
      setFormState((prev) => ({
        ...prev,
        class_id: found.id,
        kelas: found.nama_kelas,
        jurusan: found.jurusan_code,
      }));
    }
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.access_token) return;

    if (!formState.nis.trim() || !formState.nama.trim() || !formState.kelas.trim()) {
      setFormError('NIS, Nama Siswa, dan Kelas wajib diisi.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await saveStudent({
        accessToken: session.access_token,
        editingId: editingStudent?.id,
        payload: {
          nis: formState.nis.trim(),
          nama: formState.nama.trim(),
          kelas: formState.kelas.trim().toUpperCase(),
          class_id: formState.class_id || null,
          jurusan: formState.jurusan,
          jenis_kelamin: formState.jenis_kelamin,
          status: formState.status,
        },
      });

      setFormOpen(false);
      await loadAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan data siswa.');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!session?.access_token || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteStudentById({ accessToken: session.access_token, id: deleteTarget.id });
      if (detailStudentId === deleteTarget.id) {
        navigate('/app/data-siswa', { replace: true });
      }
      await loadAll();
      setDeleteTarget(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus siswa.');
    } finally {
      setDeleting(false);
    }
  }

  function openAddClassModal() {
    setEditingClass(null);
    setClassForm(INITIAL_CLASS_FORM);
    setClassError(null);
    setClassModalOpen(true);
  }

  function openEditClassModal(cls: ClassRoom) {
    setEditingClass(cls);
    setClassForm({
      nama_kelas: cls.nama_kelas,
      tingkat: cls.tingkat,
      jurusan_code: cls.jurusan_code,
      wali_kelas_id: cls.wali_kelas_id || '',
      tahun_ajaran: cls.tahun_ajaran || '2026/2027',
    });
    setClassError(null);
    setClassModalOpen(true);
  }

  async function handleSubmitClass(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.access_token) return;
    if (!classForm.nama_kelas.trim()) {
      setClassError('Nama kelas wajib diisi.');
      return;
    }

    setSavingClass(true);
    setClassError(null);
    try {
      await saveClassRoom({
        accessToken: session.access_token,
        editingId: editingClass?.id,
        payload: {
          nama_kelas: classForm.nama_kelas.trim().toUpperCase(),
          tingkat: classForm.tingkat,
          jurusan_code: classForm.jurusan_code,
          wali_kelas_id: classForm.wali_kelas_id || null,
          tahun_ajaran: classForm.tahun_ajaran.trim() || '2026/2027',
        },
      });

      setClassModalOpen(false);
      await loadAll();
    } catch (err) {
      setClassError(err instanceof Error ? err.message : 'Gagal menyimpan kelas.');
    } finally {
      setSavingClass(false);
    }
  }

  async function handleConfirmDeleteClass() {
    if (!session?.access_token || !deleteClassTarget) return;
    setDeleting(true);
    try {
      await deleteClassRoomById({
        accessToken: session.access_token,
        id: deleteClassTarget.id,
      });
      await loadAll();
      setDeleteClassTarget(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus kelas.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSeedDatabase() {
    if (!session?.access_token) return;
    setSeedingDb(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/seed-database', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setErrorMsg(payload.error || 'Gagal mengisi data relasional awal.');
      } else {
        setFeedback(payload.message || 'Data awal berhasil diisi.');
        await Promise.all([loadAll(), loadDbStatus()]);
      }
    } finally {
      setSeedingDb(false);
    }
  }

  async function handleRunMigration() {
    if (!session?.access_token) return;
    setMigratingDb(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/run-migration', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setErrorMsg(payload.error || 'Gagal menjalankan migrasi SQL.');
      } else {
        setFeedback(payload.message || 'Migrasi skema relasional selesai.');
        await Promise.all([loadAll(), loadDbStatus()]);
      }
    } finally {
      setMigratingDb(false);
    }
  }

  // Dynamic student detail view (/app/data-siswa/:id)
  if (detailStudentId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/app/data-siswa"
            className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-700 hover:text-red-600"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Kembali ke Daftar Siswa</span>
          </Link>
        </div>

        {selectedDetailStudent ? (
          <>
            <div className="rounded-xl border border-neutral-200 bg-white p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="font-mono text-xs font-semibold text-red-600 tabular-nums">
                    NIS {selectedDetailStudent.nis} · {selectedDetailStudent.jurusan}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-neutral-900">
                    {selectedDetailStudent.nama}
                  </h2>
                  <p className="mt-1 text-sm text-neutral-600">
                    Kelas {selectedDetailStudent.kelas} ·{' '}
                    {selectedDetailStudent.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'} ·{' '}
                    Status:{' '}
                    <span className="font-semibold text-neutral-900">
                      {selectedDetailStudent.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedDetailStudent)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    <span>Edit Siswa</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 px-6 py-4">
                <h3 className="text-base font-bold text-neutral-900">
                  Riwayat Kehadiran Siswa (30 Hari Terakhir)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                    <tr>
                      <th className="px-6 py-3">Tanggal</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {loadingDetail ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-sm text-neutral-500">
                          Memuat riwayat absensi siswa...
                        </td>
                      </tr>
                    ) : detailAttendance.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-sm text-neutral-500">
                          Belum ada riwayat absensi untuk siswa ini.
                        </td>
                      </tr>
                    ) : (
                      detailAttendance.map((att) => {
                        const meta = STUDENT_STATUS_META[att.status];
                        return (
                          <tr key={att.id}>
                            <td className="px-6 py-3 font-medium text-neutral-900">
                              {formatShortDate(att.tanggal)}
                            </td>
                            <td className="px-6 py-3">
                              <span
                                className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
                              >
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-xs text-neutral-600">
                              {att.catatan || '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-600">
            Data siswa tidak ditemukan.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar with Tab Switcher */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Data Siswa &amp; Relasi Kelas</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Master siswa, kelas, jurusan (TKJ, DKV, AK, BC, MPLB, BD), dan relasi database Supabase
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('students')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeTab === 'students'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Daftar Siswa ({students.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('classes')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeTab === 'classes'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Data Kelas ({classes.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('relations')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeTab === 'relations'
                    ? 'bg-white text-red-700 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Relasi Database
              </button>
            </div>

            {activeTab === 'students' && (
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah Siswa</span>
              </button>
            )}

            {activeTab === 'classes' && (
              <button
                type="button"
                onClick={openAddClassModal}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah Kelas</span>
              </button>
            )}
          </div>
        </div>

        {activeTab === 'students' && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label
                htmlFor="stu-jurusan-filter"
                className="block text-xs font-medium text-neutral-600"
              >
                Filter Jurusan
              </label>
              <select
                id="stu-jurusan-filter"
                value={jurusanFilter}
                onChange={(e) => setJurusanFilter(e.target.value as 'ALL' | JurusanCode)}
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

            <div className="lg:col-span-2">
              <label htmlFor="stu-search" className="block text-xs font-medium text-neutral-600">
                Cari NIS, Nama, atau Kelas
              </label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  id="stu-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ketik NIS, nama siswa, atau kelas (contoh: X TKJ 1)..."
                  className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-600 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800">
          {feedback}
        </div>
      )}

      {/* TAB 1: STUDENTS */}
      {activeTab === 'students' && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                <tr>
                  <th className="px-5 py-3">NIS</th>
                  <th className="px-5 py-3">Nama Lengkap</th>
                  <th className="px-5 py-3">Kelas</th>
                  <th className="px-5 py-3">Jurusan</th>
                  <th className="px-5 py-3">L/P</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-neutral-500">
                      Memuat data siswa...
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-neutral-500">
                      Belum ada data siswa. Klik &quot;Tambah Siswa&quot; atau isi data contoh pada
                      tab &quot;Relasi Database&quot;.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((stu) => (
                    <tr key={stu.id} className="hover:bg-neutral-50">
                      <td className="px-5 py-3 font-mono text-xs text-neutral-700 tabular-nums">
                        {stu.nis}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          to={`/app/data-siswa/${stu.id}`}
                          className="font-semibold text-neutral-900 hover:text-red-600 hover:underline"
                        >
                          {stu.nama}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-neutral-700">
                        {stu.classes?.nama_kelas || stu.kelas}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-red-700">
                        {stu.jurusan}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-neutral-600">
                        {stu.jenis_kelamin}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${
                            stu.status === 'aktif'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-neutral-200 bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {stu.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(stu)}
                            className="rounded-md border border-neutral-200 p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                            aria-label={`Edit ${stu.nama}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(stu)}
                            className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                            aria-label={`Hapus ${stu.nama}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CLASSES & JURUSAN */}
      {activeTab === 'classes' && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                <tr>
                  <th className="px-5 py-3">Nama Kelas</th>
                  <th className="px-5 py-3">Tingkat</th>
                  <th className="px-5 py-3">Jurusan (FK)</th>
                  <th className="px-5 py-3">Wali Kelas (FK Profiles)</th>
                  <th className="px-5 py-3">Tahun Ajaran</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {classes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-neutral-500">
                      Belum ada data kelas. Klik &quot;Tambah Kelas&quot; untuk menambahkan kelas
                      baru.
                    </td>
                  </tr>
                ) : (
                  classes.map((cls) => (
                    <tr key={cls.id} className="hover:bg-neutral-50">
                      <td className="px-5 py-3 font-semibold text-neutral-900">{cls.nama_kelas}</td>
                      <td className="px-5 py-3 font-mono text-xs text-neutral-700">{cls.tingkat}</td>
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-red-700">
                        {cls.jurusan_code}
                      </td>
                      <td className="px-5 py-3 text-xs text-neutral-700">
                        {cls.profiles?.full_name || 'Belum ditentukan'}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-neutral-600 tabular-nums">
                        {cls.tahun_ajaran}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditClassModal(cls)}
                            className="rounded-md border border-neutral-200 p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                            aria-label={`Edit ${cls.nama_kelas}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteClassTarget(cls)}
                            className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                            aria-label={`Hapus ${cls.nama_kelas}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: RELATIONAL SUPABASE SCHEMA & SEED */}
      {activeTab === 'relations' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-4 md:flex-row md:items-center">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">
                    Arsitektur Relasional Database Supabase
                  </h3>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Semua tabel menggunakan Foreign Key PostgreSQL yang berelasi langsung ke
                    Supabase Authentication (`auth.users`)
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={loadDbStatus}
                  disabled={loadingDbStatus}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Cek Relasi</span>
                </button>
                {dbStatus?.hasDbUrl && (
                  <button
                    type="button"
                    onClick={handleRunMigration}
                    disabled={migratingDb}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    <span>{migratingDb ? 'Menjalankan SQL...' : 'Sinkronkan Skema SQL'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSeedDatabase}
                  disabled={seedingDb}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{seedingDb ? 'Mengisi Data...' : 'Isi Data Contoh Kelas & Siswa'}</span>
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                  <tr>
                    <th className="px-4 py-2.5">Tabel PostgreSQL</th>
                    <th className="px-4 py-2.5">Deskripsi</th>
                    <th className="px-4 py-2.5">Relasi Foreign Key</th>
                    <th className="px-4 py-2.5 text-right">Jumlah Baris</th>
                    <th className="px-4 py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {loadingDbStatus ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-neutral-500">
                        Memeriksa koneksi tabel relasional Supabase...
                      </td>
                    </tr>
                  ) : !dbStatus ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-neutral-500">
                        Status database belum tersedia.
                      </td>
                    </tr>
                  ) : (
                    dbStatus.tables.map((t) => (
                      <tr key={t.table}>
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-neutral-900">
                          public.{t.table}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-neutral-700">{t.label}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-neutral-600">
                          {t.relation}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-neutral-900 tabular-nums">
                          {t.rowCount}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs">
                          <span
                            className={`font-semibold ${
                              t.ready ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {t.ready ? 'Terhubung' : 'Belum Ada'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {dbStatus?.schemaSql && (
              <div className="mt-6 border-t border-neutral-200 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-neutral-700">
                    Skema Relasional (`supabase/schema.sql`)
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(dbStatus.schemaSql);
                      setCopiedSql(true);
                      setTimeout(() => setCopiedSql(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
                  >
                    {copiedSql ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedSql ? 'Tersalin' : 'Salin SQL'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Student Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <h3 className="text-base font-bold text-neutral-900">
                {editingStudent ? 'Edit Data Siswa' : 'Tambah Data Siswa Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Tutup modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="stu-nis" className="block text-xs font-medium text-neutral-700">
                    NIS
                  </label>
                  <input
                    id="stu-nis"
                    type="text"
                    required
                    value={formState.nis}
                    onChange={(e) => setFormState({ ...formState, nis: e.target.value })}
                    placeholder="Contoh: 20261001"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="stu-class-rel"
                    className="block text-xs font-medium text-neutral-700"
                  >
                    Pilih Kelas Terdaftar (Relasi)
                  </label>
                  <select
                    id="stu-class-rel"
                    value={formState.class_id || '__custom__'}
                    onChange={(e) => handleSelectClassInStudentForm(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama_kelas} ({c.jurusan_code})
                      </option>
                    ))}
                    <option value="__custom__">+ Tulis Nama Kelas Manual</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="stu-nama" className="block text-xs font-medium text-neutral-700">
                  Nama Lengkap Siswa
                </label>
                <input
                  id="stu-nama"
                  type="text"
                  required
                  value={formState.nama}
                  onChange={(e) => setFormState({ ...formState, nama: e.target.value })}
                  placeholder="Contoh: Nadia Putri Pratama"
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="stu-kelas" className="block text-xs font-medium text-neutral-700">
                    Nama Kelas
                  </label>
                  <input
                    id="stu-kelas"
                    type="text"
                    required
                    value={formState.kelas}
                    onChange={(e) =>
                      setFormState({ ...formState, kelas: e.target.value, class_id: '' })
                    }
                    placeholder="Contoh: X TKJ 1"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="stu-jurusan"
                    className="block text-xs font-medium text-neutral-700"
                  >
                    Jurusan (FK)
                  </label>
                  <select
                    id="stu-jurusan"
                    value={formState.jurusan}
                    onChange={(e) =>
                      setFormState({ ...formState, jurusan: e.target.value as JurusanCode })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  >
                    {JURUSAN_LIST.map((j) => (
                      <option key={j.code} value={j.code}>
                        {j.code} — {j.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="stu-jk" className="block text-xs font-medium text-neutral-700">
                    Jenis Kelamin
                  </label>
                  <select
                    id="stu-jk"
                    value={formState.jenis_kelamin}
                    onChange={(e) =>
                      setFormState({ ...formState, jenis_kelamin: e.target.value as 'L' | 'P' })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="stu-status"
                    className="block text-xs font-medium text-neutral-700"
                  >
                    Status
                  </label>
                  <select
                    id="stu-status"
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        status: e.target.value as 'aktif' | 'nonaktif',
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {saving ? 'Menyimpan...' : editingStudent ? 'Simpan Perubahan' : 'Simpan Siswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Class Modal */}
      {classModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <h3 className="text-base font-bold text-neutral-900">
                {editingClass ? 'Edit Data Kelas' : 'Tambah Kelas Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setClassModalOpen(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Tutup modal kelas"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {classError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {classError}
              </div>
            )}

            <form onSubmit={handleSubmitClass} className="mt-4 space-y-4">
              <div>
                <label htmlFor="cls-name" className="block text-xs font-medium text-neutral-700">
                  Nama Kelas
                </label>
                <input
                  id="cls-name"
                  type="text"
                  required
                  value={classForm.nama_kelas}
                  onChange={(e) => setClassForm({ ...classForm, nama_kelas: e.target.value })}
                  placeholder="Contoh: X TKJ 2"
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="cls-tingkat"
                    className="block text-xs font-medium text-neutral-700"
                  >
                    Tingkat
                  </label>
                  <select
                    id="cls-tingkat"
                    value={classForm.tingkat}
                    onChange={(e) =>
                      setClassForm({
                        ...classForm,
                        tingkat: e.target.value as 'X' | 'XI' | 'XII',
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  >
                    <option value="X">Kelas X</option>
                    <option value="XI">Kelas XI</option>
                    <option value="XII">Kelas XII</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="cls-jurusan"
                    className="block text-xs font-medium text-neutral-700"
                  >
                    Jurusan (FK)
                  </label>
                  <select
                    id="cls-jurusan"
                    value={classForm.jurusan_code}
                    onChange={(e) =>
                      setClassForm({
                        ...classForm,
                        jurusan_code: e.target.value as JurusanCode,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  >
                    {JURUSAN_LIST.map((j) => (
                      <option key={j.code} value={j.code}>
                        {j.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="cls-wali" className="block text-xs font-medium text-neutral-700">
                  Wali Kelas (Relasi ke Guru/Admin)
                </label>
                <select
                  id="cls-wali"
                  value={classForm.wali_kelas_id}
                  onChange={(e) => setClassForm({ ...classForm, wali_kelas_id: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                >
                  <option value="">Belum ditentukan</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cls-ta" className="block text-xs font-medium text-neutral-700">
                  Tahun Ajaran
                </label>
                <input
                  id="cls-ta"
                  type="text"
                  value={classForm.tahun_ajaran}
                  onChange={(e) => setClassForm({ ...classForm, tahun_ajaran: e.target.value })}
                  placeholder="2026/2027"
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm focus:border-red-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
                <button
                  type="button"
                  onClick={() => setClassModalOpen(false)}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingClass}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {savingClass ? 'Menyimpan...' : 'Simpan Kelas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Hapus Data Siswa"
        description={`Apakah Anda yakin ingin menghapus data siswa "${deleteTarget?.nama}" (NIS ${deleteTarget?.nis})? Seluruh riwayat absensi siswa terkait juga akan terhapus.`}
        confirmLabel="Hapus Siswa"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deleteClassTarget)}
        title="Hapus Data Kelas"
        description={`Apakah Anda yakin ingin menghapus kelas "${deleteClassTarget?.nama_kelas}"? Siswa di kelas ini tetap tersimpan namun referensi class_id akan dikosongkan.`}
        confirmLabel="Hapus Kelas"
        loading={deleting}
        onConfirm={handleConfirmDeleteClass}
        onCancel={() => setDeleteClassTarget(null)}
      />
    </div>
  );
}
