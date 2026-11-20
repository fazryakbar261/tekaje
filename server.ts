import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
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
  if (!supabaseAdmin && !supabasePublic) {
    res.status(503).json({
      error: 'Konfigurasi Supabase belum lengkap pada server.',
    });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ error: 'Token otentikasi tidak ditemukan.' });
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
  // Auto-run relational schema migration if SUPABASE_DB_URL is configured
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

  // Health & Bootstrap check
  app.get('/api/health', async (_req: Request, res: Response) => {
    let tablesReady = false;
    let userCount = 0;

    if (supabaseAdmin) {
      const [profRes, jurRes, clsRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('jurusan').select('code', { count: 'exact', head: true }),
        supabaseAdmin.from('classes').select('id', { count: 'exact', head: true }),
      ]);

      if (!profRes.error && !jurRes.error && !clsRes.error) {
        tablesReady = true;
        userCount = profRes.count ?? 0;
      }
    } else if (supabasePublic) {
      const { error } = await supabasePublic.from('profiles').select('id').limit(1);
      if (!error) {
        tablesReady = true;
      }
    }

    res.json({
      configured: hasPublicConfig,
      hasServiceRole,
      hasDbUrl,
      tablesReady,
      userCount,
      schemaSql: !tablesReady ? readSchemaSql() : undefined,
    });
  });

  // Bootstrap status for Login page (checks if first user is yet to be created)
  app.get('/api/auth/bootstrap-status', async (_req: Request, res: Response) => {
    if (!supabaseAdmin) {
      res.json({
        configured: hasPublicConfig,
        hasServiceRole,
        canRegisterFirstAdmin: false,
        tablesReady: false,
      });
      return;
    }

    const { count, error } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    if (error) {
      res.json({
        configured: hasPublicConfig,
        hasServiceRole,
        canRegisterFirstAdmin: false,
        tablesReady: false,
        error: error.message,
      });
      return;
    }

    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 2,
    });
    const authUserCount = authList?.users?.length ?? 0;

    res.json({
      configured: hasPublicConfig,
      hasServiceRole,
      tablesReady: true,
      canRegisterFirstAdmin: (count ?? 0) === 0 && authUserCount === 0,
    });
  });

  // Register the very first user directly as Admin (synced to Supabase Auth)
  app.post('/api/auth/bootstrap-admin', async (req: Request, res: Response) => {
    if (!supabaseAdmin) {
      res.status(503).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server.',
      });
      return;
    }

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

  // Sync profile after login — ensures first user in Supabase Auth gets 'admin' role
  app.post(
    '/api/auth/sync-profile',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
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

  // Admin: Inspect live relational table status in Supabase
  app.get(
    '/api/admin/database-status',
    requireAuth,
    requireAdmin,
    async (_req: AuthenticatedRequest, res: Response) => {
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

  // Admin: Seed relational jurusan, classes, and sample students across all 6 jurusan
  app.post(
    '/api/admin/seed-database',
    requireAuth,
    requireAdmin,
    async (_req: AuthenticatedRequest, res: Response) => {
      try {
        // 1. Ensure 6 Jurusan exist
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

        // 2. Ensure relational classes exist
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

        // 3. Seed sample students linked relationally to class_id and jurusan
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

  // Admin: List all users synced with Supabase Authentication
  app.get(
    '/api/admin/users',
    requireAuth,
    requireAdmin,
    async (_req: AuthenticatedRequest, res: Response) => {
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

  // Admin: Create new user and sync completely with Supabase Auth
  app.post(
    '/api/admin/users',
    requireAuth,
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const { email, password, full_name, role, nip, jabatan, is_active } = req.body as {
        email?: string;
        password?: string;
        full_name?: string;
        role?: string;
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

  // Admin: Update user in both Supabase Authentication and profiles table
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
        role?: string;
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

  // Admin: Hard delete user from Supabase Authentication (cascades to profiles)
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
    console.log(`SMK Prima Unggul server berjalan pada http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Gagal menjalankan server:', err);
  process.exit(1);
});
