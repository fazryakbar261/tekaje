import { getAppMode, supabase } from './supabase';
import type {
  ClassRoom,
  EmployeeAttendance,
  EmployeeAttendanceStatus,
  JurusanCode,
  Student,
  StudentAttendance,
  StudentAttendanceStatus,
  UserProfile,
} from '../types';

const LOCAL_TOKEN_KEY = 'smk_pu_local_auth_token';

export function getLocalToken(): string | null {
  try {
    return localStorage.getItem(LOCAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setLocalToken(token: string): void {
  try {
    localStorage.setItem(LOCAL_TOKEN_KEY, token);
  } catch {
    // Ignore storage errors
  }
}

export function clearLocalToken(): void {
  try {
    localStorage.removeItem(LOCAL_TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

async function localFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const payload = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || 'Terjadi kesalahan pada server.');
  }
  return payload;
}

export async function fetchDashboardData(params: {
  profile: UserProfile;
  accessToken: string;
  today: string;
  monthPrefix: string;
}): Promise<{
  myTodayAttendance: EmployeeAttendance | null;
  myMonthCount: number;
  totalEmployees: number;
  presentEmployeesToday: number;
  totalStudents: number;
  presentStudentsToday: number;
  recentEmployeeLogs: EmployeeAttendance[];
  recentStudentLogs: StudentAttendance[];
}> {
  if (getAppMode() === 'local') {
    return localFetch(
      `/api/local/dashboard?today=${encodeURIComponent(params.today)}`,
      params.accessToken,
    );
  }

  if (!supabase) {
    throw new Error('Koneksi database belum tersedia.');
  }

  const { profile, today, monthPrefix } = params;
  const { data: mineToday } = await supabase
    .from('employee_attendance')
    .select('*')
    .eq('user_id', profile.id)
    .eq('tanggal', today)
    .maybeSingle();

  const { count: monthTotal } = await supabase
    .from('employee_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .gte('tanggal', `${monthPrefix}-01`);

  let totalEmployees = 0;
  let presentEmployeesToday = 0;
  let totalStudents = 0;
  let presentStudentsToday = 0;
  let recentEmployeeLogs: EmployeeAttendance[] = [];
  let recentStudentLogs: StudentAttendance[] = [];

  if (profile.role === 'admin') {
    const [empCountRes, empTodayRes, stuCountRes, stuTodayRes, recentEmpRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase
        .from('employee_attendance')
        .select('id', { count: 'exact', head: true })
        .eq('tanggal', today)
        .eq('status', 'hadir'),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('status', 'aktif'),
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
    totalEmployees = empCountRes.count ?? 0;
    presentEmployeesToday = empTodayRes.count ?? 0;
    totalStudents = stuCountRes.count ?? 0;
    presentStudentsToday = stuTodayRes.count ?? 0;
    recentEmployeeLogs = (recentEmpRes.data as EmployeeAttendance[]) || [];
  } else if (profile.role === 'guru') {
    const [stuCountRes, stuTodayRes, recentStuRes] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('status', 'aktif'),
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
    totalStudents = stuCountRes.count ?? 0;
    presentStudentsToday = stuTodayRes.count ?? 0;
    recentStudentLogs = (recentStuRes.data as StudentAttendance[]) || [];
  } else {
    const { data: myHistory } = await supabase
      .from('employee_attendance')
      .select('*')
      .eq('user_id', profile.id)
      .order('tanggal', { ascending: false })
      .limit(7);
    recentEmployeeLogs = (myHistory as EmployeeAttendance[]) || [];
  }

  return {
    myTodayAttendance: (mineToday as EmployeeAttendance | null) ?? null,
    myMonthCount: monthTotal ?? 0,
    totalEmployees,
    presentEmployeesToday,
    totalStudents,
    presentStudentsToday,
    recentEmployeeLogs,
    recentStudentLogs,
  };
}

export async function fetchMyEmployeeAttendance(params: {
  userId: string;
  accessToken: string;
  today: string;
  startMonth: string;
  endMonth: string;
}): Promise<{ todayRecord: EmployeeAttendance | null; history: EmployeeAttendance[] }> {
  if (getAppMode() === 'local') {
    const data = await localFetch<{ records: EmployeeAttendance[] }>(
      `/api/local/employee-attendance?scope=mine&startDate=${encodeURIComponent(params.startMonth)}&endDate=${encodeURIComponent(params.endMonth)}`,
      params.accessToken,
    );
    const todayRecord = data.records.find((r) => r.tanggal === params.today) || null;
    return { todayRecord, history: data.records };
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const [{ data: todayData }, { data: historyData, error: histErr }] = await Promise.all([
    supabase
      .from('employee_attendance')
      .select('*')
      .eq('user_id', params.userId)
      .eq('tanggal', params.today)
      .maybeSingle(),
    supabase
      .from('employee_attendance')
      .select('*')
      .eq('user_id', params.userId)
      .gte('tanggal', params.startMonth)
      .lte('tanggal', params.endMonth)
      .order('tanggal', { ascending: false }),
  ]);

  if (histErr) throw new Error(histErr.message);

  return {
    todayRecord: (todayData as EmployeeAttendance | null) ?? null,
    history: (historyData as EmployeeAttendance[]) || [],
  };
}

export async function upsertMyEmployeeAttendance(params: {
  userId: string;
  accessToken: string;
  tanggal: string;
  jam_masuk: string;
  status: EmployeeAttendanceStatus;
  catatan: string | null;
}): Promise<void> {
  if (getAppMode() === 'local') {
    await localFetch('/api/local/employee-attendance', params.accessToken, {
      method: 'POST',
      body: JSON.stringify({
        tanggal: params.tanggal,
        jam_masuk: params.jam_masuk,
        status: params.status,
        catatan: params.catatan,
      }),
    });
    return;
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const { error } = await supabase.from('employee_attendance').upsert(
    {
      user_id: params.userId,
      tanggal: params.tanggal,
      jam_masuk: params.jam_masuk,
      status: params.status,
      catatan: params.catatan,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,tanggal' },
  );
  if (error) throw new Error(error.message);
}

export async function checkOutMyEmployeeAttendance(params: {
  recordId: string;
  accessToken: string;
  jam_pulang: string;
  catatan: string | null;
}): Promise<void> {
  if (getAppMode() === 'local') {
    await localFetch(`/api/local/employee-attendance/${params.recordId}`, params.accessToken, {
      method: 'PATCH',
      body: JSON.stringify({
        jam_pulang: params.jam_pulang,
        catatan: params.catatan,
      }),
    });
    return;
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const { error } = await supabase
    .from('employee_attendance')
    .update({
      jam_pulang: params.jam_pulang,
      catatan: params.catatan,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.recordId);
  if (error) throw new Error(error.message);
}

export async function fetchAllEmployeeAttendance(params: {
  accessToken: string;
  startDate: string;
  endDate: string;
}): Promise<EmployeeAttendance[]> {
  if (getAppMode() === 'local') {
    const data = await localFetch<{ records: EmployeeAttendance[] }>(
      `/api/local/employee-attendance?scope=all&startDate=${encodeURIComponent(params.startDate)}&endDate=${encodeURIComponent(params.endDate)}`,
      params.accessToken,
    );
    return data.records;
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const { data, error } = await supabase
    .from('employee_attendance')
    .select('*, profiles(full_name, email, nip, role, jabatan)')
    .gte('tanggal', params.startDate)
    .lte('tanggal', params.endDate)
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as EmployeeAttendance[]) || [];
}

export async function fetchStudents(params: {
  accessToken: string;
  onlyActive?: boolean;
}): Promise<Student[]> {
  if (getAppMode() === 'local') {
    const q = params.onlyActive ? '?status=aktif' : '';
    const data = await localFetch<{ students: Student[] }>(
      `/api/local/students${q}`,
      params.accessToken,
    );
    return data.students;
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  let query = supabase
    .from('students')
    .select('*, classes(id, nama_kelas, tingkat, jurusan_code)');
  if (params.onlyActive) {
    query = query.eq('status', 'aktif');
  }
  const { data, error } = await query
    .order('kelas', { ascending: true })
    .order('nama', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Student[]) || [];
}

export async function saveStudent(params: {
  accessToken: string;
  editingId?: string;
  payload: {
    nis: string;
    nama: string;
    kelas: string;
    class_id?: string | null;
    jurusan: JurusanCode;
    jenis_kelamin: 'L' | 'P';
    status: 'aktif' | 'nonaktif';
  };
}): Promise<void> {
  if (getAppMode() === 'local') {
    if (params.editingId) {
      await localFetch(`/api/local/students/${params.editingId}`, params.accessToken, {
        method: 'PATCH',
        body: JSON.stringify(params.payload),
      });
    } else {
      await localFetch('/api/local/students', params.accessToken, {
        method: 'POST',
        body: JSON.stringify(params.payload),
      });
    }
    return;
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const dbPayload: Record<string, unknown> = {
    nis: params.payload.nis,
    nama: params.payload.nama,
    kelas: params.payload.kelas,
    jurusan: params.payload.jurusan,
    jenis_kelamin: params.payload.jenis_kelamin,
    status: params.payload.status,
    updated_at: new Date().toISOString(),
  };
  if (params.payload.class_id) dbPayload.class_id = params.payload.class_id;

  if (params.editingId) {
    const { error } = await supabase.from('students').update(dbPayload).eq('id', params.editingId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('students').insert(dbPayload);
    if (error) {
      throw new Error(
        error.message.includes('unique')
          ? 'NIS tersebut sudah terdaftar pada siswa lain.'
          : error.message,
      );
    }
  }
}

export async function deleteStudentById(params: {
  accessToken: string;
  id: string;
}): Promise<void> {
  if (getAppMode() === 'local') {
    await localFetch(`/api/local/students/${params.id}`, params.accessToken, {
      method: 'DELETE',
    });
    return;
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const { error } = await supabase.from('students').delete().eq('id', params.id);
  if (error) throw new Error(error.message);
}

export async function fetchClassesAndTeachers(accessToken: string): Promise<{
  classes: ClassRoom[];
  teachers: Pick<UserProfile, 'id' | 'full_name' | 'role'>[];
}> {
  if (getAppMode() === 'local') {
    return localFetch('/api/local/classes', accessToken);
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const [clsRes, profRes] = await Promise.all([
    supabase
      .from('classes')
      .select('*, profiles:wali_kelas_id(id, full_name)')
      .order('jurusan_code', { ascending: true })
      .order('nama_kelas', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['admin', 'guru'])
      .order('full_name', { ascending: true }),
  ]);

  return {
    classes: (clsRes.data as ClassRoom[]) || [],
    teachers: (profRes.data as Pick<UserProfile, 'id' | 'full_name' | 'role'>[]) || [],
  };
}

export async function saveClassRoom(params: {
  accessToken: string;
  editingId?: string;
  payload: {
    nama_kelas: string;
    tingkat: 'X' | 'XI' | 'XII';
    jurusan_code: JurusanCode;
    wali_kelas_id: string | null;
    tahun_ajaran: string;
  };
}): Promise<void> {
  if (getAppMode() === 'local') {
    if (params.editingId) {
      await localFetch(`/api/local/classes/${params.editingId}`, params.accessToken, {
        method: 'PATCH',
        body: JSON.stringify(params.payload),
      });
    } else {
      await localFetch('/api/local/classes', params.accessToken, {
        method: 'POST',
        body: JSON.stringify(params.payload),
      });
    }
    return;
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  if (params.editingId) {
    const { error } = await supabase
      .from('classes')
      .update(params.payload)
      .eq('id', params.editingId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('classes').insert(params.payload);
    if (error) throw new Error(error.message);
  }
}

export async function deleteClassRoomById(params: {
  accessToken: string;
  id: string;
}): Promise<void> {
  if (getAppMode() === 'local') {
    await localFetch(`/api/local/classes/${params.id}`, params.accessToken, {
      method: 'DELETE',
    });
    return;
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const { error } = await supabase.from('classes').delete().eq('id', params.id);
  if (error) throw new Error(error.message);
}

export async function fetchStudentAttendanceByDate(params: {
  accessToken: string;
  tanggal: string;
}): Promise<StudentAttendance[]> {
  if (getAppMode() === 'local') {
    const data = await localFetch<{ records: StudentAttendance[] }>(
      `/api/local/student-attendance?tanggal=${encodeURIComponent(params.tanggal)}`,
      params.accessToken,
    );
    return data.records;
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const { data, error } = await supabase
    .from('student_attendance')
    .select('*')
    .eq('tanggal', params.tanggal);
  if (error) throw new Error(error.message);
  return (data as StudentAttendance[]) || [];
}

export async function saveStudentAttendanceBulk(params: {
  accessToken: string;
  recordedBy: string;
  records: Array<{
    student_id: string;
    tanggal: string;
    status: StudentAttendanceStatus;
    catatan: string | null;
  }>;
}): Promise<void> {
  if (getAppMode() === 'local') {
    await localFetch('/api/local/student-attendance/bulk', params.accessToken, {
      method: 'POST',
      body: JSON.stringify({ records: params.records }),
    });
    return;
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const nowIso = new Date().toISOString();
  const payload = params.records.map((r) => ({
    ...r,
    recorded_by: params.recordedBy,
    updated_at: nowIso,
  }));

  const { error } = await supabase
    .from('student_attendance')
    .upsert(payload, { onConflict: 'student_id,tanggal' });
  if (error) throw new Error(error.message);
}

export async function fetchStudentAttendanceRange(params: {
  accessToken: string;
  startDate: string;
  endDate: string;
}): Promise<StudentAttendance[]> {
  if (getAppMode() === 'local') {
    const data = await localFetch<{ records: StudentAttendance[] }>(
      `/api/local/student-attendance?startDate=${encodeURIComponent(params.startDate)}&endDate=${encodeURIComponent(params.endDate)}`,
      params.accessToken,
    );
    return data.records;
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const { data, error } = await supabase
    .from('student_attendance')
    .select('*, students(nis, nama, kelas, jurusan), recorder:recorded_by(full_name)')
    .gte('tanggal', params.startDate)
    .lte('tanggal', params.endDate)
    .order('tanggal', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as StudentAttendance[]) || [];
}

export async function fetchStudentAttendanceByStudent(params: {
  accessToken: string;
  studentId: string;
}): Promise<StudentAttendance[]> {
  if (getAppMode() === 'local') {
    const data = await localFetch<{ records: StudentAttendance[] }>(
      `/api/local/student-attendance?studentId=${encodeURIComponent(params.studentId)}`,
      params.accessToken,
    );
    return data.records.slice(0, 30);
  }

  if (!supabase) throw new Error('Koneksi database belum tersedia.');

  const { data, error } = await supabase
    .from('student_attendance')
    .select('*')
    .eq('student_id', params.studentId)
    .order('tanggal', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data as StudentAttendance[]) || [];
}
