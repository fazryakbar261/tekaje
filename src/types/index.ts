export type UserRole = 'admin' | 'guru' | 'tenaga_kependidikan';

export type JurusanCode = 'TKJ' | 'DKV' | 'AK' | 'BC' | 'MPLB' | 'BD';

export type EmployeeAttendanceStatus = 'hadir' | 'izin' | 'sakit' | 'dinas_luar';

export type StudentAttendanceStatus = 'hadir' | 'sakit' | 'izin' | 'alpa';

export interface JurusanRecord {
  code: JurusanCode;
  nama_jurusan: string;
  bidang_keahlian: string;
  created_at: string;
}

export interface ClassRoom {
  id: string;
  nama_kelas: string;
  tingkat: 'X' | 'XI' | 'XII';
  jurusan_code: JurusanCode;
  wali_kelas_id: string | null;
  tahun_ajaran: string;
  created_at: string;
  profiles?: Pick<UserProfile, 'id' | 'full_name'> | null;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  nip: string | null;
  jabatan: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  auth_synced?: boolean;
}

export interface Student {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  class_id?: string | null;
  jurusan: JurusanCode;
  jenis_kelamin: 'L' | 'P';
  status: 'aktif' | 'nonaktif';
  created_at: string;
  classes?: Pick<ClassRoom, 'id' | 'nama_kelas' | 'tingkat' | 'jurusan_code'> | null;
}

export interface EmployeeAttendance {
  id: string;
  user_id: string;
  tanggal: string;
  jam_masuk: string | null;
  jam_pulang: string | null;
  status: EmployeeAttendanceStatus;
  catatan: string | null;
  created_at: string;
  profiles?: Pick<UserProfile, 'full_name' | 'email' | 'nip' | 'role' | 'jabatan'>;
}

export interface StudentAttendance {
  id: string;
  student_id: string;
  tanggal: string;
  status: StudentAttendanceStatus;
  catatan: string | null;
  recorded_by: string | null;
  created_at: string;
  students?: Pick<Student, 'nis' | 'nama' | 'kelas' | 'jurusan'>;
  recorder?: Pick<UserProfile, 'full_name'>;
}

export interface DatabaseTableStatus {
  table: string;
  label: string;
  relation: string;
  rowCount: number;
  ready: boolean;
}

export interface SystemHealth {
  configured: boolean;
  hasServiceRole: boolean;
  hasDbUrl?: boolean;
  tablesReady: boolean;
  userCount: number;
  schemaSql?: string;
}
