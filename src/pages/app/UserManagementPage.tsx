import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { safeParseJson } from '../../lib/supabase';
import { ROLE_LABELS, formatShortDate } from '../../lib/constants';
import type { UserProfile, UserRole } from '../../types';

interface UserFormState {
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
  nip: string;
  jabatan: string;
  is_active: boolean;
}

const INITIAL_USER_FORM: UserFormState = {
  full_name: '',
  email: '',
  password: '',
  role: 'guru',
  nip: '',
  jabatan: '',
  is_active: true,
};

export function UserManagementPage() {
  const { session, profile: currentAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Add / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [formState, setFormState] = useState<UserFormState>(INITIAL_USER_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Hard delete modal
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const parsed = await safeParseJson<{ users?: UserProfile[]; error?: string }>(res);
      if (!parsed.ok || !parsed.data) {
        setErrorMsg(parsed.errorText || 'Gagal mengambil daftar pengguna.');
        return;
      }
      setUsers(parsed.data.users || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (
          !u.full_name.toLowerCase().includes(q) &&
          !u.email.toLowerCase().includes(q) &&
          !(u.nip || '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [users, roleFilter, searchQuery]);

  function openAddModal() {
    setEditingUser(null);
    setFormState(INITIAL_USER_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(user: UserProfile) {
    setEditingUser(user);
    setFormState({
      full_name: user.full_name,
      email: user.email,
      password: '',
      role: user.role,
      nip: user.nip || '',
      jabatan: user.jabatan || '',
      is_active: user.is_active,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSubmitUser(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.access_token) return;

    if (!formState.full_name.trim() || !formState.email.trim()) {
      setFormError('Nama lengkap dan email wajib diisi.');
      return;
    }
    if (!editingUser && formState.password.length < 6) {
      setFormError('Kata sandi minimal 6 karakter untuk pengguna baru.');
      return;
    }
    if (editingUser && formState.password && formState.password.length < 6) {
      setFormError('Kata sandi baru minimal 6 karakter.');
      return;
    }

    setSaving(true);
    setFormError(null);
    setFeedback(null);
    try {
      const endpoint = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users';
      const method = editingUser ? 'PATCH' : 'POST';
      const bodyPayload: Record<string, unknown> = {
        full_name: formState.full_name.trim(),
        email: formState.email.trim().toLowerCase(),
        role: formState.role,
        nip: formState.nip.trim() || null,
        jabatan: formState.jabatan.trim() || null,
        is_active: formState.is_active,
      };
      if (formState.password) {
        bodyPayload.password = formState.password;
      }

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(bodyPayload),
      });

      const parsed = await safeParseJson<{ error?: string }>(res);
      if (!parsed.ok) {
        setFormError(parsed.errorText || 'Gagal menyimpan data pengguna.');
        return;
      }

      setModalOpen(false);
      setFeedback(
        editingUser
          ? `Data pengguna ${formState.full_name} berhasil diperbarui dan disinkronkan dengan Supabase Auth.`
          : `Pengguna baru ${formState.full_name} berhasil dibuat di Supabase Authentication.`,
      );
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmHardDelete() {
    if (!session?.access_token || !deleteTarget) return;

    setDeleting(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const parsed = await safeParseJson<{ error?: string; message?: string }>(res);
      if (!parsed.ok) {
        setErrorMsg(parsed.errorText || 'Gagal menghapus pengguna.');
      } else {
        setFeedback(
          parsed.data?.message ||
            `Akun ${deleteTarget.full_name} berhasil dihapus permanen hingga ke Supabase Authentication.`,
        );
        await loadUsers();
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">User Management</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Tambah, edit, dan hapus permanen pengguna yang tersinkronisasi penuh dengan Supabase
              Authentication
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={loadUsers}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Segarkan</span>
            </button>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Pengguna</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="usr-role-filter" className="block text-xs font-medium text-neutral-600">
              Filter Peran
            </label>
            <select
              id="usr-role-filter"
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

          <div className="lg:col-span-2">
            <label htmlFor="usr-search" className="block text-xs font-medium text-neutral-600">
              Cari Nama, Email, atau NIP
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                id="usr-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari akun pengguna..."
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

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800">
          {feedback}
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
              <tr>
                <th className="px-5 py-3">Nama &amp; Jabatan</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">NIP</th>
                <th className="px-5 py-3">Peran</th>
                <th className="px-5 py-3">Status Auth</th>
                <th className="px-5 py-3">Terdaftar</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-neutral-500">
                    Memuat data pengguna dari Supabase Authentication...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-neutral-500">
                    Tidak ada pengguna yang sesuai dengan pencarian.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = currentAdmin?.id === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-neutral-50">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-neutral-900">
                          {u.full_name}
                          {isSelf && (
                            <span className="ml-2 text-xs font-medium text-red-600">(Anda)</span>
                          )}
                        </p>
                        <p className="text-xs text-neutral-500">{u.jabatan || '—'}</p>
                      </td>
                      <td className="px-5 py-3 text-xs text-neutral-700">{u.email}</td>
                      <td className="px-5 py-3 font-mono text-xs text-neutral-600 tabular-nums">
                        {u.nip || '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${
                            u.role === 'admin'
                              ? 'border-red-200 bg-red-50 text-red-800'
                              : u.role === 'guru'
                                ? 'border-sky-200 bg-sky-50 text-sky-800'
                                : 'border-neutral-200 bg-neutral-100 text-neutral-800'
                          }`}
                        >
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs">
                        <span
                          className={`font-semibold ${
                            u.is_active ? 'text-emerald-700' : 'text-neutral-500'
                          }`}
                        >
                          {u.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <span className="mx-1.5 text-neutral-300">·</span>
                        <span className="text-neutral-500">
                          {u.auth_synced ? 'Auth Synced' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-neutral-500 whitespace-nowrap">
                        {formatShortDate(u.created_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="rounded-md border border-neutral-200 p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                            aria-label={`Edit ${u.full_name}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => setDeleteTarget(u)}
                            className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Hapus permanen ${u.full_name}`}
                            title={
                              isSelf
                                ? 'Tidak dapat menghapus akun sendiri'
                                : 'Hapus permanen sampai ke Supabase Auth'
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit User Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <h3 className="text-base font-bold text-neutral-900">
                {editingUser ? 'Edit Pengguna & Supabase Auth' : 'Tambah Pengguna Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
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

            <form onSubmit={handleSubmitUser} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="u-name" className="block text-xs font-medium text-neutral-700">
                    Nama Lengkap
                  </label>
                  <input
                    id="u-name"
                    type="text"
                    required
                    value={formState.full_name}
                    onChange={(e) => setFormState({ ...formState, full_name: e.target.value })}
                    placeholder="Contoh: Siti Rahmawati, S.Pd."
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="u-role" className="block text-xs font-medium text-neutral-700">
                    Peran (Role)
                  </label>
                  <select
                    id="u-role"
                    value={formState.role}
                    onChange={(e) =>
                      setFormState({ ...formState, role: e.target.value as UserRole })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  >
                    <option value="admin">Administrator</option>
                    <option value="guru">Guru</option>
                    <option value="tenaga_kependidikan">Tenaga Kependidikan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="u-email" className="block text-xs font-medium text-neutral-700">
                    Email Login
                  </label>
                  <input
                    id="u-email"
                    type="email"
                    required
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    placeholder="guru@smkprimaunggul.sch.id"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="u-password"
                    className="block text-xs font-medium text-neutral-700"
                  >
                    {editingUser ? 'Kata Sandi Baru (Opsional)' : 'Kata Sandi (Min. 6 karakter)'}
                  </label>
                  <input
                    id="u-password"
                    type="password"
                    required={!editingUser}
                    minLength={editingUser ? undefined : 6}
                    value={formState.password}
                    onChange={(e) => setFormState({ ...formState, password: e.target.value })}
                    placeholder={editingUser ? 'Kosongkan jika tidak diubah' : 'Minimal 6 karakter'}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="u-nip" className="block text-xs font-medium text-neutral-700">
                    NIP / NUPTK (Opsional)
                  </label>
                  <input
                    id="u-nip"
                    type="text"
                    value={formState.nip}
                    onChange={(e) => setFormState({ ...formState, nip: e.target.value })}
                    placeholder="198903122015022001"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="u-jabatan" className="block text-xs font-medium text-neutral-700">
                    Jabatan (Opsional)
                  </label>
                  <input
                    id="u-jabatan"
                    type="text"
                    value={formState.jabatan}
                    onChange={(e) => setFormState({ ...formState, jabatan: e.target.value })}
                    placeholder="Contoh: Guru Produktif TKJ / Staf TU"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none"
                  />
                </div>
              </div>

              {editingUser && (
                <div className="flex items-center gap-2.5 pt-1">
                  <input
                    id="u-active"
                    type="checkbox"
                    checked={formState.is_active}
                    onChange={(e) => setFormState({ ...formState, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                  />
                  <label htmlFor="u-active" className="text-xs font-medium text-neutral-700">
                    Akun Aktif (dapat login ke sistem)
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {saving
                    ? 'Menyinkronkan...'
                    : editingUser
                      ? 'Simpan & Sinkronkan'
                      : 'Buat Akun Pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hard Delete Confirmation Modal */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Hapus Permanen Pengguna"
        description={`Tindakan ini akan melakukan hard delete terhadap "${deleteTarget?.full_name}" (${deleteTarget?.email}) dari database aplikasi sekaligus menghapus akunnya secara permanen dari Supabase Authentication. Data absensi karyawan yang terkait juga akan dihapus.`}
        confirmLabel="Hapus Permanen"
        loading={deleting}
        onConfirm={handleConfirmHardDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
