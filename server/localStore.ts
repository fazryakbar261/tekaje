import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ClassRoom,
  EmployeeAttendance,
  EmployeeAttendanceStatus,
  JurusanCode,
  JurusanRecord,
  Student,
  StudentAttendance,
  StudentAttendanceStatus,
  UserProfile,
  UserRole,
} from '../src/types/index.ts';

interface StoredAuthUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  lastSignInAt: string | null;
}

interface LocalDatabase {
  authUsers: StoredAuthUser[];
  profiles: UserProfile[];
  jurusan: JurusanRecord[];
  classes: ClassRoom[];
  students: Student[];
  employee_attendance: EmployeeAttendance[];
  student_attendance: StudentAttendance[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'school-db.json');

const TOKEN_SECRET =
  process.env.LOCAL_AUTH_SECRET ||
  process.env.SESSION_SECRET ||
  'smk-prima-unggul-local-relational-secret-2026';

function createInitialDb(): LocalDatabase {
  const now = new Date().toISOString();
  const jurusan: JurusanRecord[] = [
    {
      code: 'TKJ',
      nama_jurusan: 'Teknik Komputer dan Jaringan',
      bidang_keahlian: 'Teknologi Informasi & Desain Kreatif',
      created_at: now,
    },
    {
      code: 'DKV',
      nama_jurusan: 'Desain Komunikasi Visual',
      bidang_keahlian: 'Teknologi Informasi & Desain Kreatif',
      created_at: now,
    },
    {
      code: 'BC',
      nama_jurusan: 'Broadcasting dan Perfilman',
      bidang_keahlian: 'Media Penyiaran & Bisnis Digital',
      created_at: now,
    },
    {
      code: 'BD',
      nama_jurusan: 'Bisnis Digital',
      bidang_keahlian: 'Media Penyiaran & Bisnis Digital',
      created_at: now,
    },
    {
      code: 'AK',
      nama_jurusan: 'Akuntansi',
      bidang_keahlian: 'Keuangan & Manajemen Perkantoran',
      created_at: now,
    },
    {
      code: 'MPLB',
      nama_jurusan: 'Manajemen Perkantoran dan Layanan Bisnis',
      bidang_keahlian: 'Keuangan & Manajemen Perkantoran',
      created_at: now,
    },
  ];

  const classes: ClassRoom[] = [
    {
      id: crypto.randomUUID(),
      nama_kelas: 'X TKJ 1',
      tingkat: 'X',
      jurusan_code: 'TKJ',
      wali_kelas_id: null,
      tahun_ajaran: '2026/2027',
      created_at: now,
    },
    {
      id: crypto.randomUUID(),
      nama_kelas: 'X DKV 1',
      tingkat: 'X',
      jurusan_code: 'DKV',
      wali_kelas_id: null,
      tahun_ajaran: '2026/2027',
      created_at: now,
    },
    {
      id: crypto.randomUUID(),
      nama_kelas: 'X AK 1',
      tingkat: 'X',
      jurusan_code: 'AK',
      wali_kelas_id: null,
      tahun_ajaran: '2026/2027',
      created_at: now,
    },
    {
      id: crypto.randomUUID(),
      nama_kelas: 'X BC 1',
      tingkat: 'X',
      jurusan_code: 'BC',
      wali_kelas_id: null,
      tahun_ajaran: '2026/2027',
      created_at: now,
    },
    {
      id: crypto.randomUUID(),
      nama_kelas: 'X MPLB 1',
      tingkat: 'X',
      jurusan_code: 'MPLB',
      wali_kelas_id: null,
      tahun_ajaran: '2026/2027',
      created_at: now,
    },
    {
      id: crypto.randomUUID(),
      nama_kelas: 'X BD 1',
      tingkat: 'X',
      jurusan_code: 'BD',
      wali_kelas_id: null,
      tahun_ajaran: '2026/2027',
      created_at: now,
    },
  ];

  return {
    authUsers: [],
    profiles: [],
    jurusan,
    classes,
    students: [],
    employee_attendance: [],
    student_attendance: [],
  };
}

export function readLocalDb(): LocalDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<LocalDatabase>;
    const fallback = createInitialDb();
    return {
      authUsers: parsed.authUsers || [],
      profiles: parsed.profiles || [],
      jurusan: parsed.jurusan?.length ? parsed.jurusan : fallback.jurusan,
      classes: parsed.classes?.length ? parsed.classes : fallback.classes,
      students: parsed.students || [],
      employee_attendance: parsed.employee_attendance || [],
      student_attendance: parsed.student_attendance || [],
    };
  } catch {
    const initial = createInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

export function writeLocalDb(db: LocalDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, originalHex] = storedHash.split(':');
  if (!salt || !originalHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function signLocalToken(userId: string, email: string): string {
  const payload = {
    sub: userId,
    email,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyLocalToken(token: string): { sub: string; email: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as {
      sub: string;
      email: string;
      exp: number;
    };
    if (!parsed.sub || Date.now() > parsed.exp) return null;
    return { sub: parsed.sub, email: parsed.email };
  } catch {
    return null;
  }
}

export function createLocalUser(input: {
  email: string;
  password: string;
  full_name: string;
  role?: UserRole;
  nip?: string | null;
  jabatan?: string | null;
  is_active?: boolean;
}): { user?: UserProfile; error?: string } {
  const db = readLocalDb();
  const normalizedEmail = input.email.trim().toLowerCase();

  if (db.authUsers.some((u) => u.email === normalizedEmail)) {
    return { error: 'Email sudah terdaftar di sistem.' };
  }

  const now = new Date().toISOString();
  const isFirstUser = db.profiles.length === 0 && db.authUsers.length === 0;
  const assignedRole: UserRole = isFirstUser
    ? 'admin'
    : input.role || 'tenaga_kependidikan';

  const id = crypto.randomUUID();
  const authUser: StoredAuthUser = {
    id,
    email: normalizedEmail,
    passwordHash: hashPassword(input.password),
    createdAt: now,
    lastSignInAt: null,
  };

  const profile: UserProfile = {
    id,
    email: normalizedEmail,
    full_name: input.full_name.trim(),
    nip: input.nip?.trim() || null,
    jabatan: input.jabatan?.trim() || (isFirstUser ? 'Administrator Sistem' : null),
    role: assignedRole,
    is_active: input.is_active ?? true,
    created_at: now,
    updated_at: now,
  };

  db.authUsers.push(authUser);
  db.profiles.push(profile);
  writeLocalDb(db);

  return { user: profile };
}

export function authenticateLocalUser(
  email: string,
  password: string,
): { token?: string; profile?: UserProfile; error?: string } {
  const db = readLocalDb();
  const normalizedEmail = email.trim().toLowerCase();
  const authUser = db.authUsers.find((u) => u.email === normalizedEmail);

  if (!authUser || !verifyPassword(password, authUser.passwordHash)) {
    return { error: 'Email atau kata sandi salah. Silakan periksa kembali.' };
  }

  const profile = db.profiles.find((p) => p.id === authUser.id);
  if (!profile) {
    return { error: 'Profil pengguna tidak ditemukan.' };
  }
  if (!profile.is_active) {
    return { error: 'Akun Anda sedang dinonaktifkan. Hubungi Administrator sekolah.' };
  }

  authUser.lastSignInAt = new Date().toISOString();
  writeLocalDb(db);

  const token = signLocalToken(authUser.id, authUser.email);
  return { token, profile };
}

export function syncStudentClassLink(
  db: LocalDatabase,
  input: { kelas: string; jurusan: JurusanCode; class_id?: string | null },
): { class_id: string; kelas: string; jurusan: JurusanCode } {
  if (input.class_id) {
    const foundById = db.classes.find((c) => c.id === input.class_id);
    if (foundById) {
      return {
        class_id: foundById.id,
        kelas: foundById.nama_kelas,
        jurusan: foundById.jurusan_code,
      };
    }
  }

  const normalizedName = input.kelas.trim().toUpperCase();
  let foundByName = db.classes.find((c) => c.nama_kelas.toUpperCase() === normalizedName);
  if (!foundByName) {
    const tingkat: 'X' | 'XI' | 'XII' = normalizedName.startsWith('XII')
      ? 'XII'
      : normalizedName.startsWith('XI')
        ? 'XI'
        : 'X';
    foundByName = {
      id: crypto.randomUUID(),
      nama_kelas: normalizedName,
      tingkat,
      jurusan_code: input.jurusan,
      wali_kelas_id: null,
      tahun_ajaran: '2026/2027',
      created_at: new Date().toISOString(),
    };
    db.classes.push(foundByName);
  }

  return {
    class_id: foundByName.id,
    kelas: foundByName.nama_kelas,
    jurusan: input.jurusan,
  };
}

export function seedLocalSampleStudents(): { count: number } {
  const db = readLocalDb();
  const sampleRows: Array<{
    nis: string;
    nama: string;
    kelas: string;
    jurusan: JurusanCode;
    jenis_kelamin: 'L' | 'P';
  }> = [
    { nis: '20260101', nama: 'Bagas Prakoso', kelas: 'X TKJ 1', jurusan: 'TKJ', jenis_kelamin: 'L' },
    { nis: '20260102', nama: 'Rania Azzahra', kelas: 'X TKJ 1', jurusan: 'TKJ', jenis_kelamin: 'P' },
    { nis: '20260201', nama: 'Dimas Wijaya', kelas: 'X DKV 1', jurusan: 'DKV', jenis_kelamin: 'L' },
    { nis: '20260202', nama: 'Nadia Putri Pratama', kelas: 'X DKV 1', jurusan: 'DKV', jenis_kelamin: 'P' },
    { nis: '20260301', nama: 'Salsa Bila Kusuma', kelas: 'X AK 1', jurusan: 'AK', jenis_kelamin: 'P' },
    { nis: '20260401', nama: 'Reza Mahendra', kelas: 'X BC 1', jurusan: 'BC', jenis_kelamin: 'L' },
    { nis: '20260501', nama: 'Aulia Permata Sari', kelas: 'X MPLB 1', jurusan: 'MPLB', jenis_kelamin: 'P' },
    { nis: '20260601', nama: 'Fajar Nugroho', kelas: 'X BD 1', jurusan: 'BD', jenis_kelamin: 'L' },
  ];

  let added = 0;
  const now = new Date().toISOString();
  for (const row of sampleRows) {
    if (db.students.some((s) => s.nis === row.nis)) continue;
    const rel = syncStudentClassLink(db, { kelas: row.kelas, jurusan: row.jurusan });
    db.students.push({
      id: crypto.randomUUID(),
      nis: row.nis,
      nama: row.nama,
      kelas: rel.kelas,
      class_id: rel.class_id,
      jurusan: rel.jurusan,
      jenis_kelamin: row.jenis_kelamin,
      status: 'aktif',
      created_at: now,
    });
    added += 1;
  }

  writeLocalDb(db);
  return { count: added };
}

export function upsertLocalEmployeeAttendance(input: {
  user_id: string;
  tanggal: string;
  jam_masuk?: string | null;
  jam_pulang?: string | null;
  status: EmployeeAttendanceStatus;
  catatan?: string | null;
}): EmployeeAttendance {
  const db = readLocalDb();
  const now = new Date().toISOString();
  const idx = db.employee_attendance.findIndex(
    (r) => r.user_id === input.user_id && r.tanggal === input.tanggal,
  );

  if (idx >= 0) {
    const existing = db.employee_attendance[idx];
    const updated: EmployeeAttendance = {
      ...existing,
      jam_masuk: input.jam_masuk !== undefined ? input.jam_masuk : existing.jam_masuk,
      jam_pulang: input.jam_pulang !== undefined ? input.jam_pulang : existing.jam_pulang,
      status: input.status,
      catatan: input.catatan !== undefined ? input.catatan : existing.catatan,
    };
    db.employee_attendance[idx] = updated;
    writeLocalDb(db);
    return updated;
  }

  const created: EmployeeAttendance = {
    id: crypto.randomUUID(),
    user_id: input.user_id,
    tanggal: input.tanggal,
    jam_masuk: input.jam_masuk ?? now,
    jam_pulang: input.jam_pulang ?? null,
    status: input.status,
    catatan: input.catatan ?? null,
    created_at: now,
  };
  db.employee_attendance.push(created);
  writeLocalDb(db);
  return created;
}

export function upsertLocalStudentAttendanceBulk(
  records: Array<{
    student_id: string;
    tanggal: string;
    status: StudentAttendanceStatus;
    catatan: string | null;
    recorded_by: string;
  }>,
): number {
  const db = readLocalDb();
  const now = new Date().toISOString();

  for (const item of records) {
    if (!db.students.some((s) => s.id === item.student_id)) continue;
    const idx = db.student_attendance.findIndex(
      (r) => r.student_id === item.student_id && r.tanggal === item.tanggal,
    );
    if (idx >= 0) {
      db.student_attendance[idx] = {
        ...db.student_attendance[idx],
        status: item.status,
        catatan: item.catatan,
        recorded_by: item.recorded_by,
      };
    } else {
      db.student_attendance.push({
        id: crypto.randomUUID(),
        student_id: item.student_id,
        tanggal: item.tanggal,
        status: item.status,
        catatan: item.catatan,
        recorded_by: item.recorded_by,
        created_at: now,
      });
    }
  }

  writeLocalDb(db);
  return records.length;
}
