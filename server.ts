import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import pg from 'pg';
import {
  authenticateLocalUser,
  createLocalUser,
  hashPassword,
  readLocalDb,
  seedLocalSampleStudents,
  syncStudentClassLink,
  upsertLocalEmployeeAttendance,
  upsertLocalStudentAttendanceBulk,
  verifyLocalToken,
  writeLocalDb,
} from './server/localStore.ts';
import type {
  EmployeeAttendanceStatus,
  JurusanCode,
  StudentAttendanceStatus,
  UserProfile,
  UserRole,
} from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const hasPublicConfig =
  isValidHttpUrl(SUPABASE_URL) &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes('your-supabase');

const hasServiceRole =
  hasPublicConfig &&
  SUPABASE_SERVICE_ROLE_KEY.length > 20 &&
  !SUPABASE_SERVICE_ROLE_KEY.includes('your-supabase');

const hasDbUrl =
  (SUPABASE_DB_URL.startsWith('postgres://') || SUPABASE_DB_URL.startsWith('postgresql://')) &&
  !SUPABASE_DB_URL.includes('[YOUR-PASSWORD]');

const APP_MODE: 'supabase' | 'local' = hasPublicConfig ? 'supabase' : 'local';

const supabaseAdmin: SupabaseClient | null = hasServiceRole
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

const supabasePublic: SupabaseClient | null = hasPublicConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

interface AuthenticatedRequest extends Request {
  authUser?: User;
  localProfile?: UserProfile;
  userRole?: string;
}

function readSchemaSql(): string {
  try {
    const schemaPath = path.join(__dirname, 'supabase', 'schema.sql');
    return fs.readFileSync(schemaPath, 'utf-8');
  } catch {
    return '';
  }
}

async function executeSchemaMigration(): Promise<{ ok: boolean; error?: string }> {
  if (!hasDbUrl) {
    return {
      ok: false,
      error: 'SUPABASE_DB_URL belum dikonfigurasi pada environment server.',
    };
  }

  const sql = readSchemaSql();
  if (!sql) {
    return { ok: false, error: 'File supabase/schema.sql tidak ditemukan.' };
  }

  const client = new pg.Client({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(sql);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal menjalankan migrasi SQL.',
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ error: 'Token otentikasi tidak ditemukan.' });
    return;
  }

  if (APP_MODE === 'local') {
    const verified = verifyLocalToken(token);
    if (!verified) {
      res.status(401).json({ error: 'Sesi login lokal tidak valid atau telah berakhir.' });
      return;
    }
    const db = readLocalDb();
    const profile = db.profiles.find((p) => p.id === verified.sub);
    if (!profile || !profile.is_active) {
      res.status(401).json({ error: 'Akun tidak ditemukan atau sedang dinonaktifkan.' });
      return;
    }
    req.localProfile = profile;
    req.userRole = profile.role;
    next();
    return;
  }

  if (!supabaseAdmin && !supabasePublic) {
    res.status(503).json({
      error: 'Konfigurasi Supabase belum lengkap pada server.',
    });
    return;
  }

  const client = supabaseAdmin || supabasePublic!;
  const { data, error } = await client.auth.getUser(token);

  if (error || !data?.user) {
    res.status(401).json({ error: 'Sesi login tidak valid atau telah berakhir.' });
    return;
  }

  req.authUser = data.user;
  next();
}

async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (APP_MODE === 'local') {
    if (!req.localProfile || req.localProfile.role !== 'admin') {
      res.status(403).json({ error: 'Akses ditolak. Hanya Admin yang diizinkan.' });
      return;
    }
    next();
    return;
  }

  if (!supabaseAdmin) {
    res.status(503).json({
      error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server.',
    });
    return;
  }

  if (!req.authUser) {
    res.status(401).json({ error: 'Tidak terotentikasi.' });
    return;
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', req.authUser.id)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: `Gagal memverifikasi peran admin: ${error.message}` });
    return;
  }

  if (!profile || profile.role !== 'admin') {
    res.status(403).json({ error: 'Akses ditolak. Hanya Admin yang diizinkan.' });
    return;
  }

  req.userRole = profile.role;
  next();
}

async function createServer(): Promise<void> {
  if (hasDbUrl) {
    const migration = await executeSchemaMigration();
    if (migration.ok) {
      console.log('Skema relasional Supabase berhasil diverifikasi/dimigrasi.');
    } else {
      console.warn('Peringatan migrasi otomatis Supabase:', migration.error);
    }
  }

  const app = express();
  app.use(express.json());

  // Runtime public configuration for client (supports Secrets with or without VITE_ prefix)
  app.get('/api/config', (_req: Request, res: Response) => {
    res.json({
      mode: APP_MODE,
      supabaseUrl: hasPublicConfig ? SUPABASE_URL : '',
      supabaseAnonKey: hasPublicConfig ? SUPABASE_ANON_KEY : '',
    });
  });

  // Health & Bootstrap check
  app.get('/api/health', async (_req: Request, res: Response) => {
    if (APP_MODE === 'local') {
      const db = readLocalDb();
      res.json({
        mode: 'local',
        configured: true,
        hasServiceRole: true,
        hasDbUrl: false,
        tablesReady: true,
        userCount: db.profiles.length,
        schemaSql: readSchemaSql(),
      });
      return;
    }

    let tablesReady = false;
    let userCount = 0;
    let healthError: string | undefined;
    let authAdminOk = false;

    if (supabaseAdmin) {
      const [profRes, jurRes, clsRes, authRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('id', { count: 'exact' }).limit(1),
        supabaseAdmin.from('jurusan').select('code', { count: 'exact' }).limit(1),
        supabaseAdmin.from('classes').select('id', { count: 'exact' }).limit(1),
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }),
      ]);

      authAdminOk = !authRes.error;

      if (!profRes.error && !jurRes.error && !clsRes.error) {
        tablesReady = true;
        userCount = profRes.count ?? 0;
      } else {
        const firstErr = profRes.error || jurRes.error || clsRes.error;
        healthError = firstErr?.message || firstErr?.code || `HTTP ${profRes.status || jurRes.status || clsRes.status}`;
      }
    } else if (supabasePublic) {
      const { error, status } = await supabasePublic.from('profiles').select('id').limit(1);
      if (!error) {
        tablesReady = true;
      } else {
        healthError = error.message || error.code || `HTTP ${status}`;
      }
    }

    res.json({
      mode: 'supabase',
      configured: hasPublicConfig,
      hasServiceRole,
      authAdminOk,
      hasDbUrl,
      tablesReady,
      userCount,
      diagnostic: healthError,
      schemaSql: !tablesReady ? readSchemaSql() : undefined,
    });
  });

  // Bootstrap status for Login page
  app.get('/api/auth/bootstrap-status', async (_req: Request, res: Response) => {
    if (APP_MODE === 'local') {
      const db = readLocalDb();
      res.json({
        mode: 'local',
        configured: true,
        hasServiceRole: true,
        tablesReady: true,
        canRegisterFirstAdmin: db.profiles.length === 0,
      });
      return;
    }

    if (!supabaseAdmin) {
      // If anon key is set without service role, check profiles table directly
      if (supabasePublic) {
        const { count, error, status } = await supabasePublic
          .from('profiles')
          .select('id', { count: 'exact' })
          .limit(1);
        res.json({
          mode: 'supabase',
          configured: hasPublicConfig,
          hasServiceRole: false,
          tablesReady: !error,
          canRegisterFirstAdmin: !error && (count ?? 0) === 0,
          error: error ? error.message || error.code || `HTTP ${status}` : undefined,
        });
        return;
      }

      res.json({
        mode: 'supabase',
        configured: hasPublicConfig,
        hasServiceRole: false,
        canRegisterFirstAdmin: false,
        tablesReady: false,
      });
      return;
    }

    const { count, error, status } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact' })
      .limit(1);

    if (error) {
      res.json({
        mode: 'supabase',
        configured: hasPublicConfig,
        hasServiceRole,
        canRegisterFirstAdmin: false,
        tablesReady: false,
        error: error.message || error.code || `HTTP ${status}`,
      });
      return;
    }

    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 2,
    });
    const authUserCount = authList?.users?.length ?? 0;

    res.json({
      mode: 'supabase',
      configured: hasPublicConfig,
      hasServiceRole,
      tablesReady: true,
      canRegisterFirstAdmin: (count ?? 0) === 0 && authUserCount === 0,
    });
  });

  // Register first Admin user (works in BOTH Local Relational Mode and Supabase Mode)
  app.post('/api/auth/bootstrap-admin', async (req: Request, res: Response) => {
    const { full_name, email, password, nip, jabatan } = req.body as {
      full_name?: string;
      email?: string;
      password?: string;
      nip?: string;
      jabatan?: string;
    };

    if (!full_name?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({
        error: 'Nama lengkap, email valid, dan password minimal 6 karakter wajib diisi.',
      });
      return;
    }

    if (APP_MODE === 'local') {
      const db = readLocalDb();
      if (db.profiles.length > 0) {
        res.status(403).json({
          error: 'Admin pertama sudah terdaftar. Silakan masuk atau hubungi Administrator.',
        });
        return;
      }

      const created = createLocalUser({
        email: email.trim().toLowerCase(),
        password,
        full_name: full_name.trim(),
        role: 'admin',
        nip: nip?.trim() || null,
        jabatan: jabatan?.trim() || 'Administrator Sistem',
      });

      if (created.error || !created.user) {
        res.status(400).json({ error: created.error || 'Gagal membuat admin pertama.' });
        return;
      }

      const auth = authenticateLocalUser(email.trim().toLowerCase(), password);
      res.status(201).json({
        message: 'Akun Administrator pertama berhasil dibuat.',
        token: auth.token,
        profile: auth.profile,
        user: {
          id: created.user.id,
          email: created.user.email,
          role: 'admin',
        },
      });
      return;
    }

    if (!supabaseAdmin) {
      res.status(503).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server.',
      });
      return;
    }

    const { count, error: countError } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      res.status(500).json({
        error: `Tabel database belum siap. Jalankan schema.sql terlebih dahulu: ${countError.message}`,
      });
      return;
    }

    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 2,
    });

    if ((count ?? 0) > 0 || (authList?.users?.length ?? 0) > 0) {
      res.status(403).json({
        error: 'Admin pertama sudah terdaftar. Silakan masuk atau hubungi Administrator.',
      });
      return;
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name.trim(),
        role: 'admin',
        nip: nip?.trim() || null,
        jabatan: jabatan?.trim() || 'Administrator Sistem',
      },
    });

    if (createError || !created.user) {
      res.status(400).json({
        error: createError?.message || 'Gagal membuat akun admin di Supabase Auth.',
      });
      return;
    }

    const { error: upsertError } = await supabaseAdmin.from('profiles').upsert({
      id: created.user.id,
      email: email.trim().toLowerCase(),
      full_name: full_name.trim(),
      nip: nip?.trim() || null,
      jabatan: jabatan?.trim() || 'Administrator Sistem',
      role: 'admin',
      is_active: true,
    });

    if (upsertError) {
      res.status(500).json({ error: upsertError.message });
      return;
    }

    res.status(201).json({
      message: 'Akun Administrator pertama berhasil dibuat dan disinkronkan.',
      user: {
        id: created.user.id,
        email: created.user.email,
        role: 'admin',
      },
    });
  });

  // Local Mode Auth Endpoints
  app.post('/api/local/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
      return;
    }

    const result = authenticateLocalUser(email, password);
    if (result.error || !result.token || !result.profile) {
      res.status(401).json({ error: result.error || 'Email atau kata sandi salah.' });
      return;
    }

    res.json({ token: result.token, profile: result.profile });
  });

  app.get('/api/local/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ profile: req.localProfile });
  });

  // Local Mode Relational Data Endpoints
  app.get('/api/local/dashboard', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const db = readLocalDb();
    const profile = req.localProfile!;
    const today = String(req.query.today || new Date().toISOString().slice(0, 10));
    const monthStart = `${today.slice(0, 7)}-01`;

    const myTodayAttendance =
      db.employee_attendance.find((r) => r.user_id === profile.id && r.tanggal === today) || null;
    const myMonthCount = db.employee_attendance.filter(
      (r) => r.user_id === profile.id && r.tanggal >= monthStart,
    ).length;

    const totalEmployees = db.profiles.filter((p) => p.is_active).length;
    const presentEmployeesToday = db.employee_attendance.filter(
      (r) => r.tanggal === today && r.status === 'hadir',
    ).length;

    const activeStudents = db.students.filter((s) => s.status === 'aktif');
    const totalStudents = activeStudents.length;
    const presentStudentsToday = db.student_attendance.filter(
      (r) => r.tanggal === today && r.status === 'hadir',
    ).length;

    const profileMap = new Map(db.profiles.map((p) => [p.id, p]));
    const studentMap = new Map(db.students.map((s) => [s.id, s]));

    const recentEmployeeLogs =
      profile.role === 'admin'
        ? db.employee_attendance
            .filter((r) => r.tanggal === today)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 8)
            .map((r) => {
              const p = profileMap.get(r.user_id);
              return {
                ...r,
                profiles: p
                  ? {
                      full_name: p.full_name,
                      email: p.email,
                      nip: p.nip,
                      role: p.role,
                      jabatan: p.jabatan,
                    }
                  : undefined,
              };
            })
        : db.employee_attendance
            .filter((r) => r.user_id === profile.id)
            .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
            .slice(0, 7);

    const recentStudentLogs =
      profile.role === 'guru'
        ? db.student_attendance
            .filter((r) => r.tanggal === today)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 8)
            .map((r) => {
              const stu = studentMap.get(r.student_id);
              return {
                ...r,
                students: stu
                  ? { nis: stu.nis, nama: stu.nama, kelas: stu.kelas, jurusan: stu.jurusan }
                  : undefined,
              };
            })
        : [];

    res.json({
      myTodayAttendance,
      myMonthCount,
      totalEmployees,
      presentEmployeesToday,
      totalStudents,
      presentStudentsToday,
      recentEmployeeLogs,
      recentStudentLogs,
    });
  });

  app.get(
    '/api/local/employee-attendance',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const db = readLocalDb();
      const profile = req.localProfile!;
      const scope = String(req.query.scope || 'mine');
      const startDate = String(req.query.startDate || '');
      const endDate = String(req.query.endDate || '');

      const profileMap = new Map(db.profiles.map((p) => [p.id, p]));
      let rows = db.employee_attendance;

      if (scope !== 'all' || profile.role !== 'admin') {
        rows = rows.filter((r) => r.user_id === profile.id);
      }
      if (startDate) rows = rows.filter((r) => r.tanggal >= startDate);
      if (endDate) rows = rows.filter((r) => r.tanggal <= endDate);

      const enriched = rows
        .slice()
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.created_at.localeCompare(a.created_at))
        .map((r) => {
          const p = profileMap.get(r.user_id);
          return {
            ...r,
            profiles: p
              ? {
                  full_name: p.full_name,
                  email: p.email,
                  nip: p.nip,
                  role: p.role,
                  jabatan: p.jabatan,
                }
              : undefined,
          };
        });

      res.json({ records: enriched });
    },
  );

  app.post(
    '/api/local/employee-attendance',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const profile = req.localProfile!;
      const { tanggal, jam_masuk, jam_pulang, status, catatan } = req.body as {
        tanggal?: string;
        jam_masuk?: string | null;
        jam_pulang?: string | null;
        status?: EmployeeAttendanceStatus;
        catatan?: string | null;
      };

      if (!tanggal || !status) {
        res.status(400).json({ error: 'Tanggal dan status wajib diisi.' });
        return;
      }

      const record = upsertLocalEmployeeAttendance({
        user_id: profile.id,
        tanggal,
        jam_masuk,
        jam_pulang,
        status,
        catatan: catatan ?? null,
      });

      res.json({ record });
    },
  );

  app.patch(
    '/api/local/employee-attendance/:id',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const id = String(req.params.id || '');
      const profile = req.localProfile!;
      const db = readLocalDb();
      const idx = db.employee_attendance.findIndex((r) => r.id === id);

      if (idx < 0) {
        res.status(404).json({ error: 'Catatan absensi tidak ditemukan.' });
        return;
      }
      if (db.employee_attendance[idx].user_id !== profile.id && profile.role !== 'admin') {
        res.status(403).json({ error: 'Tidak diizinkan mengubah absensi pengguna lain.' });
        return;
      }

      const { jam_pulang, catatan } = req.body as {
        jam_pulang?: string | null;
        catatan?: string | null;
      };
      db.employee_attendance[idx] = {
        ...db.employee_attendance[idx],
        ...(jam_pulang !== undefined ? { jam_pulang } : {}),
        ...(catatan !== undefined ? { catatan } : {}),
      };
      writeLocalDb(db);
      res.json({ record: db.employee_attendance[idx] });
    },
  );

  app.get('/api/local/classes', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const db = readLocalDb();
    const profileMap = new Map(db.profiles.map((p) => [p.id, p]));
    const classes = db.classes
      .slice()
      .sort((a, b) => a.jurusan_code.localeCompare(b.jurusan_code) || a.nama_kelas.localeCompare(b.nama_kelas))
      .map((c) => {
        const wali = c.wali_kelas_id ? profileMap.get(c.wali_kelas_id) : null;
        return {
          ...c,
          profiles: wali ? { id: wali.id, full_name: wali.full_name } : null,
        };
      });
    const teachers = db.profiles
      .filter((p) => p.role === 'admin' || p.role === 'guru')
      .map((p) => ({ id: p.id, full_name: p.full_name, role: p.role }));
    res.json({ classes, teachers });
  });

  app.post(
    '/api/local/classes',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const { nama_kelas, tingkat, jurusan_code, wali_kelas_id, tahun_ajaran } = req.body as {
        nama_kelas?: string;
        tingkat?: 'X' | 'XI' | 'XII';
        jurusan_code?: JurusanCode;
        wali_kelas_id?: string | null;
        tahun_ajaran?: string;
      };

      if (!nama_kelas?.trim() || !tingkat || !jurusan_code) {
        res.status(400).json({ error: 'Nama kelas, tingkat, dan jurusan wajib diisi.' });
        return;
      }

      const db = readLocalDb();
      const normalized = nama_kelas.trim().toUpperCase();
      if (db.classes.some((c) => c.nama_kelas.toUpperCase() === normalized)) {
        res.status(400).json({ error: 'Nama kelas sudah ada.' });
        return;
      }

      const created = {
        id: crypto.randomUUID(),
        nama_kelas: normalized,
        tingkat,
        jurusan_code,
        wali_kelas_id: wali_kelas_id || null,
        tahun_ajaran: tahun_ajaran?.trim() || '2026/2027',
        created_at: new Date().toISOString(),
      };
      db.classes.push(created);
      writeLocalDb(db);
      res.status(201).json({ classRoom: created });
    },
  );

  app.patch(
    '/api/local/classes/:id',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const id = String(req.params.id || '');
      const db = readLocalDb();
      const idx = db.classes.findIndex((c) => c.id === id);
      if (idx < 0) {
        res.status(404).json({ error: 'Kelas tidak ditemukan.' });
        return;
      }

      const { nama_kelas, tingkat, jurusan_code, wali_kelas_id, tahun_ajaran } = req.body as {
        nama_kelas?: string;
        tingkat?: 'X' | 'XI' | 'XII';
        jurusan_code?: JurusanCode;
        wali_kelas_id?: string | null;
        tahun_ajaran?: string;
      };

      db.classes[idx] = {
        ...db.classes[idx],
        ...(nama_kelas?.trim() ? { nama_kelas: nama_kelas.trim().toUpperCase() } : {}),
        ...(tingkat ? { tingkat } : {}),
        ...(jurusan_code ? { jurusan_code } : {}),
        ...(wali_kelas_id !== undefined ? { wali_kelas_id: wali_kelas_id || null } : {}),
        ...(tahun_ajaran?.trim() ? { tahun_ajaran: tahun_ajaran.trim() } : {}),
      };
      writeLocalDb(db);
      res.json({ classRoom: db.classes[idx] });
    },
  );

  app.delete(
    '/api/local/classes/:id',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const id = String(req.params.id || '');
      const db = readLocalDb();
      db.classes = db.classes.filter((c) => c.id !== id);
      db.students = db.students.map((s) => (s.class_id === id ? { ...s, class_id: null } : s));
      writeLocalDb(db);
      res.json({ message: 'Kelas berhasil dihapus.' });
    },
  );

  app.get('/api/local/students', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const db = readLocalDb();
    const onlyActive = req.query.status === 'aktif';
    const classMap = new Map(db.classes.map((c) => [c.id, c]));

    let rows = db.students;
    if (onlyActive) {
      rows = rows.filter((s) => s.status === 'aktif');
    }

    const enriched = rows
      .slice()
      .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama))
      .map((s) => {
        const cls = s.class_id ? classMap.get(s.class_id) : null;
        return {
          ...s,
          classes: cls
            ? {
                id: cls.id,
                nama_kelas: cls.nama_kelas,
                tingkat: cls.tingkat,
                jurusan_code: cls.jurusan_code,
              }
            : null,
        };
      });

    res.json({ students: enriched });
  });

  app.post(
    '/api/local/students',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const { nis, nama, kelas, class_id, jurusan, jenis_kelamin, status } = req.body as {
        nis?: string;
        nama?: string;
        kelas?: string;
        class_id?: string | null;
        jurusan?: JurusanCode;
        jenis_kelamin?: 'L' | 'P';
        status?: 'aktif' | 'nonaktif';
      };

      if (!nis?.trim() || !nama?.trim() || !kelas?.trim() || !jurusan) {
        res.status(400).json({ error: 'NIS, Nama Siswa, Kelas, dan Jurusan wajib diisi.' });
        return;
      }

      const db = readLocalDb();
      if (db.students.some((s) => s.nis === nis.trim())) {
        res.status(400).json({ error: 'NIS tersebut sudah terdaftar pada siswa lain.' });
        return;
      }

      const rel = syncStudentClassLink(db, { kelas, jurusan, class_id });
      const created = {
        id: crypto.randomUUID(),
        nis: nis.trim(),
        nama: nama.trim(),
        kelas: rel.kelas,
        class_id: rel.class_id,
        jurusan: rel.jurusan,
        jenis_kelamin: jenis_kelamin || 'L',
        status: status || 'aktif',
        created_at: new Date().toISOString(),
      };
      db.students.push(created);
      writeLocalDb(db);
      res.status(201).json({ student: created });
    },
  );

  app.patch(
    '/api/local/students/:id',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const id = String(req.params.id || '');
      const db = readLocalDb();
      const idx = db.students.findIndex((s) => s.id === id);
      if (idx < 0) {
        res.status(404).json({ error: 'Data siswa tidak ditemukan.' });
        return;
      }

      const { nis, nama, kelas, class_id, jurusan, jenis_kelamin, status } = req.body as {
        nis?: string;
        nama?: string;
        kelas?: string;
        class_id?: string | null;
        jurusan?: JurusanCode;
        jenis_kelamin?: 'L' | 'P';
        status?: 'aktif' | 'nonaktif';
      };

      const nextKelas = kelas?.trim() || db.students[idx].kelas;
      const nextJurusan = jurusan || db.students[idx].jurusan;
      const rel = syncStudentClassLink(db, {
        kelas: nextKelas,
        jurusan: nextJurusan,
        class_id,
      });

      db.students[idx] = {
        ...db.students[idx],
        ...(nis?.trim() ? { nis: nis.trim() } : {}),
        ...(nama?.trim() ? { nama: nama.trim() } : {}),
        kelas: rel.kelas,
        class_id: rel.class_id,
        jurusan: rel.jurusan,
        ...(jenis_kelamin ? { jenis_kelamin } : {}),
        ...(status ? { status } : {}),
      };
      writeLocalDb(db);
      res.json({ student: db.students[idx] });
    },
  );

  app.delete(
    '/api/local/students/:id',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const id = String(req.params.id || '');
      const db = readLocalDb();
      db.students = db.students.filter((s) => s.id !== id);
      db.student_attendance = db.student_attendance.filter((a) => a.student_id !== id);
      writeLocalDb(db);
      res.json({ message: 'Data siswa dan riwayat absensinya berhasil dihapus.' });
    },
  );

  app.get(
    '/api/local/student-attendance',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const profile = req.localProfile!;
      if (profile.role !== 'admin' && profile.role !== 'guru') {
        res.status(403).json({ error: 'Akses ditolak.' });
        return;
      }

      const db = readLocalDb();
      const tanggal = String(req.query.tanggal || '');
      const startDate = String(req.query.startDate || '');
      const endDate = String(req.query.endDate || '');
      const studentId = String(req.query.studentId || '');

      const studentMap = new Map(db.students.map((s) => [s.id, s]));
      const profileMap = new Map(db.profiles.map((p) => [p.id, p]));

      let rows = db.student_attendance;
      if (tanggal) rows = rows.filter((r) => r.tanggal === tanggal);
      if (startDate) rows = rows.filter((r) => r.tanggal >= startDate);
      if (endDate) rows = rows.filter((r) => r.tanggal <= endDate);
      if (studentId) rows = rows.filter((r) => r.student_id === studentId);

      const enriched = rows
        .slice()
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
        .map((r) => {
          const stu = studentMap.get(r.student_id);
          const rec = r.recorded_by ? profileMap.get(r.recorded_by) : null;
          return {
            ...r,
            students: stu
              ? { nis: stu.nis, nama: stu.nama, kelas: stu.kelas, jurusan: stu.jurusan }
              : undefined,
            recorder: rec ? { full_name: rec.full_name } : undefined,
          };
        });

      res.json({ records: enriched });
    },
  );

  app.post(
    '/api/local/student-attendance/bulk',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const profile = req.localProfile!;
      if (profile.role !== 'admin' && profile.role !== 'guru') {
        res.status(403).json({ error: 'Hanya Admin dan Guru yang dapat mencatat absensi siswa.' });
        return;
      }

      const { records } = req.body as {
        records?: Array<{
          student_id: string;
          tanggal: string;
          status: StudentAttendanceStatus;
          catatan: string | null;
        }>;
      };

      if (!Array.isArray(records) || records.length === 0) {
        res.status(400).json({ error: 'Data absensi siswa tidak boleh kosong.' });
        return;
      }

      const savedCount = upsertLocalStudentAttendanceBulk(
        records.map((r) => ({ ...r, recorded_by: profile.id })),
      );
      res.json({ savedCount });
    },
  );

  // Sync profile after login — ensures first user in Supabase Auth gets 'admin' role
  app.post(
    '/api/auth/sync-profile',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      if (APP_MODE === 'local') {
        res.json({ profile: req.localProfile });
        return;
      }

      if (!supabaseAdmin) {
        res.status(503).json({
          error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.',
        });
        return;
      }

      const authUser = req.authUser!;
      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (existing) {
        res.json({ profile: existing });
        return;
      }

      const { count } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      const { data: adminCheck } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .limit(1);

      const shouldBeAdmin = (count ?? 0) === 0 || !adminCheck || adminCheck.length === 0;
      const metadataRole = authUser.user_metadata?.role;
      const resolvedRole = shouldBeAdmin
        ? 'admin'
        : metadataRole === 'admin' || metadataRole === 'guru' || metadataRole === 'tenaga_kependidikan'
          ? metadataRole
          : 'tenaga_kependidikan';

      const newProfile = {
        id: authUser.id,
        email: authUser.email || '',
        full_name:
          authUser.user_metadata?.full_name ||
          (authUser.email ? authUser.email.split('@')[0] : 'Pengguna'),
        nip: authUser.user_metadata?.nip || null,
        jabatan: authUser.user_metadata?.jabatan || (shouldBeAdmin ? 'Administrator' : null),
        role: resolvedRole,
        is_active: true,
      };

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('profiles')
        .upsert(newProfile)
        .select('*')
        .single();

      if (insertError) {
        res.status(500).json({ error: insertError.message });
        return;
      }

      res.json({ profile: inserted });
    },
  );

  // Admin: Inspect live relational table status
  app.get(
    '/api/admin/database-status',
    requireAuth,
    requireAdmin,
    async (_req: AuthenticatedRequest, res: Response) => {
      if (APP_MODE === 'local') {
        const db = readLocalDb();
        res.json({
          hasDbUrl: false,
          tables: [
            {
              table: 'profiles',
              label: 'Profil Karyawan & Akun',
              relation: 'auth.users(id) -> profiles(id) [1:1]',
              rowCount: db.profiles.length,
              ready: true,
            },
            {
              table: 'jurusan',
              label: 'Master Jurusan',
              relation: 'jurusan(code) -> classes & students [1:N]',
              rowCount: db.jurusan.length,
              ready: true,
            },
            {
              table: 'classes',
              label: 'Master Kelas',
              relation: 'jurusan(code) & profiles(id) -> classes [N:1]',
              rowCount: db.classes.length,
              ready: true,
            },
            {
              table: 'students',
              label: 'Data Siswa',
              relation: 'classes(id) & jurusan(code) -> students [N:1]',
              rowCount: db.students.length,
              ready: true,
            },
            {
              table: 'employee_attendance',
              label: 'Absensi Karyawan',
              relation: 'profiles(id) -> employee_attendance(user_id) [1:N]',
              rowCount: db.employee_attendance.length,
              ready: true,
            },
            {
              table: 'student_attendance',
              label: 'Absensi Siswa',
              relation: 'students(id) & profiles(id) -> student_attendance [N:1]',
              rowCount: db.student_attendance.length,
              ready: true,
            },
          ],
          schemaSql: readSchemaSql(),
        });
        return;
      }

      const specs = [
        {
          table: 'profiles',
          label: 'Profil Karyawan & Akun',
          relation: 'auth.users(id) -> profiles(id) [1:1]',
        },
        {
          table: 'jurusan',
          label: 'Master Jurusan',
          relation: 'jurusan(code) -> classes & students [1:N]',
        },
        {
          table: 'classes',
          label: 'Master Kelas',
          relation: 'jurusan(code) & profiles(id) -> classes [N:1]',
        },
        {
          table: 'students',
          label: 'Data Siswa',
          relation: 'classes(id) & jurusan(code) -> students [N:1]',
        },
        {
          table: 'employee_attendance',
          label: 'Absensi Karyawan',
          relation: 'profiles(id) -> employee_attendance(user_id) [1:N]',
        },
        {
          table: 'student_attendance',
          label: 'Absensi Siswa',
          relation: 'students(id) & profiles(id) -> student_attendance [N:1]',
        },
      ];

      const results = await Promise.all(
        specs.map(async (spec) => {
          const { count, error } = await supabaseAdmin!
            .from(spec.table)
            .select('*', { count: 'exact', head: true });
          return {
            ...spec,
            rowCount: count ?? 0,
            ready: !error,
          };
        }),
      );

      res.json({
        hasDbUrl,
        tables: results,
        schemaSql: readSchemaSql(),
      });
    },
  );

  // Admin: Execute schema.sql directly via SUPABASE_DB_URL
  app.post(
    '/api/admin/run-migration',
    requireAuth,
    requireAdmin,
    async (_req: AuthenticatedRequest, res: Response) => {
      const result = await executeSchemaMigration();
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ message: 'Skema relasional Supabase berhasil dijalankan.' });
    },
  );

  // Admin: Seed relational jurusan, classes, and sample students
  app.post(
    '/api/admin/seed-database',
    requireAuth,
    requireAdmin,
    async (_req: AuthenticatedRequest, res: Response) => {
      if (APP_MODE === 'local') {
        const result = seedLocalSampleStudents();
        res.json({
          message:
            result.count > 0
              ? `Berhasil menambahkan ${result.count} siswa contoh relasional untuk 6 jurusan.`
              : 'Data contoh 6 Jurusan, Kelas, dan Siswa sudah tersedia.',
        });
        return;
      }

      try {
        const jurusanSeed = [
          {
            code: 'TKJ',
            nama_jurusan: 'Teknik Komputer dan Jaringan',
            bidang_keahlian: 'Teknologi Informasi & Desain Kreatif',
          },
          {
            code: 'DKV',
            nama_jurusan: 'Desain Komunikasi Visual',
            bidang_keahlian: 'Teknologi Informasi & Desain Kreatif',
          },
          {
            code: 'BC',
            nama_jurusan: 'Broadcasting dan Perfilman',
            bidang_keahlian: 'Media Penyiaran & Bisnis Digital',
          },
          {
            code: 'BD',
            nama_jurusan: 'Bisnis Digital',
            bidang_keahlian: 'Media Penyiaran & Bisnis Digital',
          },
          {
            code: 'AK',
            nama_jurusan: 'Akuntansi',
            bidang_keahlian: 'Keuangan & Manajemen Perkantoran',
          },
          {
            code: 'MPLB',
            nama_jurusan: 'Manajemen Perkantoran dan Layanan Bisnis',
            bidang_keahlian: 'Keuangan & Manajemen Perkantoran',
          },
        ];

        const { error: jurErr } = await supabaseAdmin!
          .from('jurusan')
          .upsert(jurusanSeed, { onConflict: 'code' });
        if (jurErr) {
          res.status(500).json({ error: `Gagal mengisi tabel jurusan: ${jurErr.message}` });
          return;
        }

        const classesSeed = [
          { nama_kelas: 'X TKJ 1', tingkat: 'X', jurusan_code: 'TKJ' },
          { nama_kelas: 'X DKV 1', tingkat: 'X', jurusan_code: 'DKV' },
          { nama_kelas: 'X AK 1', tingkat: 'X', jurusan_code: 'AK' },
          { nama_kelas: 'X BC 1', tingkat: 'X', jurusan_code: 'BC' },
          { nama_kelas: 'X MPLB 1', tingkat: 'X', jurusan_code: 'MPLB' },
          { nama_kelas: 'X BD 1', tingkat: 'X', jurusan_code: 'BD' },
        ];

        const { error: clsErr } = await supabaseAdmin!
          .from('classes')
          .upsert(classesSeed, { onConflict: 'nama_kelas' });
        if (clsErr) {
          res.status(500).json({ error: `Gagal mengisi tabel classes: ${clsErr.message}` });
          return;
        }

        const { data: classRows } = await supabaseAdmin!.from('classes').select('id, nama_kelas');
        const classMap = new Map<string, string>();
        for (const c of classRows || []) {
          classMap.set(c.nama_kelas as string, c.id as string);
        }

        const sampleStudents = [
          { nis: '20260101', nama: 'Bagas Prakoso', kelas: 'X TKJ 1', jurusan: 'TKJ', jenis_kelamin: 'L' },
          { nis: '20260102', nama: 'Rania Azzahra', kelas: 'X TKJ 1', jurusan: 'TKJ', jenis_kelamin: 'P' },
          { nis: '20260201', nama: 'Dimas Wijaya', kelas: 'X DKV 1', jurusan: 'DKV', jenis_kelamin: 'L' },
          { nis: '20260202', nama: 'Nadia Putri Pratama', kelas: 'X DKV 1', jurusan: 'DKV', jenis_kelamin: 'P' },
          { nis: '20260301', nama: 'Salsa Bila Kusuma', kelas: 'X AK 1', jurusan: 'AK', jenis_kelamin: 'P' },
          { nis: '20260401', nama: 'Reza Mahendra', kelas: 'X BC 1', jurusan: 'BC', jenis_kelamin: 'L' },
          { nis: '20260501', nama: 'Aulia Permata Sari', kelas: 'X MPLB 1', jurusan: 'MPLB', jenis_kelamin: 'P' },
          { nis: '20260601', nama: 'Fajar Nugroho', kelas: 'X BD 1', jurusan: 'BD', jenis_kelamin: 'L' },
        ].map((s) => ({
          ...s,
          class_id: classMap.get(s.kelas) || null,
          status: 'aktif',
        }));

        const { error: stuErr } = await supabaseAdmin!
          .from('students')
          .upsert(sampleStudents, { onConflict: 'nis' });
        if (stuErr) {
          res.status(500).json({ error: `Gagal mengisi data siswa: ${stuErr.message}` });
          return;
        }

        res.json({
          message:
            'Data relasional 6 Jurusan, 6 Kelas, dan 8 Siswa contoh berhasil disinkronkan ke Supabase.',
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Gagal mengisi data relasional.',
        });
      }
    },
  );

  // Admin: List all users
  app.get(
    '/api/admin/users',
    requireAuth,
    requireAdmin,
    async (_req: AuthenticatedRequest, res: Response) => {
      if (APP_MODE === 'local') {
        const db = readLocalDb();
        const authMap = new Map(db.authUsers.map((u) => [u.id, u]));
        const users = db.profiles.map((p) => {
          const au = authMap.get(p.id);
          return {
            ...p,
            last_sign_in_at: au?.lastSignInAt || null,
            email_confirmed_at: au?.createdAt || null,
            auth_synced: Boolean(au),
          };
        });
        res.json({ users });
        return;
      }

      try {
        const [{ data: profiles, error: profilesError }, { data: authData, error: authError }] =
          await Promise.all([
            supabaseAdmin!.from('profiles').select('*').order('created_at', { ascending: true }),
            supabaseAdmin!.auth.admin.listUsers({ page: 1, perPage: 1000 }),
          ]);

        if (profilesError) {
          res.status(500).json({ error: profilesError.message });
          return;
        }
        if (authError) {
          res.status(500).json({ error: authError.message });
          return;
        }

        const authMap = new Map<string, User>();
        for (const u of authData.users) {
          authMap.set(u.id, u);
        }

        const profileMap = new Map<string, Record<string, unknown>>();
        for (const p of profiles || []) {
          profileMap.set(p.id, p);
        }

        const merged = (profiles || []).map((p) => {
          const authUser = authMap.get(p.id);
          return {
            ...p,
            last_sign_in_at: authUser?.last_sign_in_at || null,
            email_confirmed_at: authUser?.email_confirmed_at || null,
            auth_synced: Boolean(authUser),
          };
        });

        for (const authUser of authData.users) {
          if (!profileMap.has(authUser.id)) {
            merged.push({
              id: authUser.id,
              email: authUser.email || '',
              full_name:
                authUser.user_metadata?.full_name ||
                (authUser.email ? authUser.email.split('@')[0] : 'Pengguna'),
              nip: authUser.user_metadata?.nip || null,
              jabatan: authUser.user_metadata?.jabatan || null,
              role: authUser.user_metadata?.role || 'tenaga_kependidikan',
              is_active: true,
              created_at: authUser.created_at,
              updated_at: authUser.updated_at || authUser.created_at,
              last_sign_in_at: authUser.last_sign_in_at || null,
              email_confirmed_at: authUser.email_confirmed_at || null,
              auth_synced: true,
            });
          }
        }

        res.json({ users: merged });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Gagal memuat data pengguna.';
        res.status(500).json({ error: message });
      }
    },
  );

  // Admin: Create new user
  app.post(
    '/api/admin/users',
    requireAuth,
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const { email, password, full_name, role, nip, jabatan, is_active } = req.body as {
        email?: string;
        password?: string;
        full_name?: string;
        role?: UserRole;
        nip?: string;
        jabatan?: string;
        is_active?: boolean;
      };

      if (!email?.trim() || !password || password.length < 6 || !full_name?.trim()) {
        res.status(400).json({
          error: 'Nama lengkap, email, dan password minimal 6 karakter wajib diisi.',
        });
        return;
      }

      if (role !== 'admin' && role !== 'guru' && role !== 'tenaga_kependidikan') {
        res.status(400).json({ error: 'Peran pengguna tidak valid.' });
        return;
      }

      if (APP_MODE === 'local') {
        const result = createLocalUser({
          email,
          password,
          full_name,
          role,
          nip,
          jabatan,
          is_active,
        });
        if (result.error || !result.user) {
          res.status(400).json({ error: result.error || 'Gagal membuat pengguna.' });
          return;
        }
        res.status(201).json({
          user: {
            ...result.user,
            auth_synced: true,
          },
        });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();

      const { data: authCreated, error: authError } = await supabaseAdmin!.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name.trim(),
          role,
          nip: nip?.trim() || null,
          jabatan: jabatan?.trim() || null,
        },
      });

      if (authError || !authCreated.user) {
        res.status(400).json({
          error: authError?.message || 'Gagal membuat user di Supabase Authentication.',
        });
        return;
      }

      const { data: profile, error: profileError } = await supabaseAdmin!
        .from('profiles')
        .upsert({
          id: authCreated.user.id,
          email: normalizedEmail,
          full_name: full_name.trim(),
          nip: nip?.trim() || null,
          jabatan: jabatan?.trim() || null,
          role,
          is_active: is_active ?? true,
        })
        .select('*')
        .single();

      if (profileError) {
        await supabaseAdmin!.auth.admin.deleteUser(authCreated.user.id);
        res.status(500).json({ error: profileError.message });
        return;
      }

      res.status(201).json({
        user: {
          ...profile,
          last_sign_in_at: authCreated.user.last_sign_in_at || null,
          email_confirmed_at: authCreated.user.email_confirmed_at || null,
          auth_synced: true,
        },
      });
    },
  );

  // Admin: Update user
  app.patch(
    '/api/admin/users/:id',
    requireAuth,
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const id = String(req.params.id || '');
      const { email, password, full_name, role, nip, jabatan, is_active } = req.body as {
        email?: string;
        password?: string;
        full_name?: string;
        role?: UserRole;
        nip?: string;
        jabatan?: string;
        is_active?: boolean;
      };

      if (!id) {
        res.status(400).json({ error: 'ID user tidak valid.' });
        return;
      }

      if (role && role !== 'admin' && role !== 'guru' && role !== 'tenaga_kependidikan') {
        res.status(400).json({ error: 'Peran pengguna tidak valid.' });
        return;
      }

      if (password && password.length > 0 && password.length < 6) {
        res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
        return;
      }

      if (APP_MODE === 'local') {
        const db = readLocalDb();
        const profIdx = db.profiles.findIndex((p) => p.id === id);
        const authIdx = db.authUsers.findIndex((u) => u.id === id);
        if (profIdx < 0 || authIdx < 0) {
          res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
          return;
        }

        const nextEmail = email?.trim() ? email.trim().toLowerCase() : db.profiles[profIdx].email;
        if (
          nextEmail !== db.profiles[profIdx].email &&
          db.authUsers.some((u) => u.email === nextEmail && u.id !== id)
        ) {
          res.status(400).json({ error: 'Email sudah digunakan oleh pengguna lain.' });
          return;
        }

        db.authUsers[authIdx] = {
          ...db.authUsers[authIdx],
          email: nextEmail,
          ...(password && password.length >= 6 ? { passwordHash: hashPassword(password) } : {}),
        };

        db.profiles[profIdx] = {
          ...db.profiles[profIdx],
          email: nextEmail,
          ...(full_name?.trim() ? { full_name: full_name.trim() } : {}),
          ...(role ? { role } : {}),
          ...(nip !== undefined ? { nip: nip?.trim() || null } : {}),
          ...(jabatan !== undefined ? { jabatan: jabatan?.trim() || null } : {}),
          ...(is_active !== undefined ? { is_active } : {}),
          updated_at: new Date().toISOString(),
        };

        writeLocalDb(db);
        res.json({ user: { ...db.profiles[profIdx], auth_synced: true } });
        return;
      }

      const authUpdates: {
        email?: string;
        password?: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      } = {};

      if (email?.trim()) {
        authUpdates.email = email.trim().toLowerCase();
        authUpdates.email_confirm = true;
      }
      if (password && password.length >= 6) {
        authUpdates.password = password;
      }

      authUpdates.user_metadata = {
        ...(full_name ? { full_name: full_name.trim() } : {}),
        ...(role ? { role } : {}),
        nip: nip?.trim() || null,
        jabatan: jabatan?.trim() || null,
      };

      const { data: authUpdated, error: authError } =
        await supabaseAdmin!.auth.admin.updateUserById(id, authUpdates);

      if (authError) {
        res.status(400).json({
          error: `Gagal memperbarui Supabase Auth: ${authError.message}`,
        });
        return;
      }

      const profileUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (email?.trim()) profileUpdates.email = email.trim().toLowerCase();
      if (full_name?.trim()) profileUpdates.full_name = full_name.trim();
      if (role) profileUpdates.role = role;
      if (nip !== undefined) profileUpdates.nip = nip?.trim() || null;
      if (jabatan !== undefined) profileUpdates.jabatan = jabatan?.trim() || null;
      if (is_active !== undefined) profileUpdates.is_active = is_active;

      const { data: profile, error: profileError } = await supabaseAdmin!
        .from('profiles')
        .update(profileUpdates)
        .eq('id', id)
        .select('*')
        .single();

      if (profileError) {
        res.status(500).json({ error: profileError.message });
        return;
      }

      res.json({
        user: {
          ...profile,
          last_sign_in_at: authUpdated.user?.last_sign_in_at || null,
          email_confirmed_at: authUpdated.user?.email_confirmed_at || null,
          auth_synced: true,
        },
      });
    },
  );

  // Admin: Hard delete user
  app.delete(
    '/api/admin/users/:id',
    requireAuth,
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const id = String(req.params.id || '');
      if (!id) {
        res.status(400).json({ error: 'ID user tidak valid.' });
        return;
      }

      if (APP_MODE === 'local') {
        if (req.localProfile?.id === id) {
          res.status(400).json({
            error: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif.',
          });
          return;
        }
        const db = readLocalDb();
        db.authUsers = db.authUsers.filter((u) => u.id !== id);
        db.profiles = db.profiles.filter((p) => p.id !== id);
        db.employee_attendance = db.employee_attendance.filter((a) => a.user_id !== id);
        db.classes = db.classes.map((c) =>
          c.wali_kelas_id === id ? { ...c, wali_kelas_id: null } : c,
        );
        writeLocalDb(db);
        res.json({ message: 'Pengguna berhasil dihapus permanen dari sistem autentikasi.' });
        return;
      }

      if (req.authUser?.id === id) {
        res.status(400).json({
          error: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif.',
        });
        return;
      }

      const { error: deleteAuthError } = await supabaseAdmin!.auth.admin.deleteUser(id, false);
      if (deleteAuthError) {
        res.status(400).json({
          error: `Gagal menghapus akun dari Supabase Authentication: ${deleteAuthError.message}`,
        });
        return;
      }

      await supabaseAdmin!.from('profiles').delete().eq('id', id);

      res.json({
        message: 'Pengguna berhasil dihapus permanen hingga ke Supabase Authentication.',
      });
    },
  );

  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  });

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan internal server.';
      res.status(500).json({ error: message });
      return;
    }
    next(err);
  });

  // Vite dev middleware vs static production serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `SMK Prima Unggul server berjalan pada http://0.0.0.0:${PORT} (mode: ${APP_MODE})`,
    );
  });
}

createServer().catch((err) => {
  console.error('Gagal menjalankan server:', err);
  process.exit(1);
});
