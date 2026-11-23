-- ============================================================================
-- SMK Prima Unggul — Skema Database Relasional Supabase (PostgreSQL + Auth)
-- Relasi Utama:
--   1. auth.users (1) <---> (1) public.profiles
--   2. public.profiles (1) ---> (N) public.employee_attendance
--   3. public.jurusan (1) ---> (N) public.classes
--   4. public.profiles (wali_kelas) (1) ---> (N) public.classes
--   5. public.classes (1) ---> (N) public.students
--   6. public.jurusan (1) ---> (N) public.students
--   7. public.students (1) ---> (N) public.student_attendance
--   8. public.profiles (recorded_by) (1) ---> (N) public.student_attendance
-- ============================================================================

-- 1. Tabel Master Jurusan (6 Kompetensi Keahlian SMK Prima Unggul)
create table if not exists public.jurusan (
  code text primary key check (code in ('TKJ', 'DKV', 'AK', 'BC', 'MPLB', 'BD')),
  nama_jurusan text not null,
  bidang_keahlian text not null,
  created_at timestamptz not null default now()
);

-- 2. Tabel Profil Pengguna (Relasi 1:1 ke auth.users Supabase Authentication)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  nip text,
  jabatan text,
  role text not null default 'tenaga_kependidikan'
    check (role in ('admin', 'guru', 'tenaga_kependidikan')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Tabel Master Kelas (Berelasi ke Jurusan & Wali Kelas pada Profiles)
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  nama_kelas text not null unique,
  tingkat text not null check (tingkat in ('X', 'XI', 'XII')),
  jurusan_code text not null references public.jurusan(code) on update cascade on delete restrict,
  wali_kelas_id uuid references public.profiles(id) on delete set null,
  tahun_ajaran text not null default '2026/2027',
  created_at timestamptz not null default now()
);

-- 4. Tabel Data Siswa (Berelasi ke Master Kelas dan Master Jurusan)
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  nis text not null unique,
  nama text not null,
  kelas text not null,
  class_id uuid references public.classes(id) on delete set null,
  jurusan text not null references public.jurusan(code) on update cascade on delete restrict,
  jenis_kelamin text not null default 'L' check (jenis_kelamin in ('L', 'P')),
  status text not null default 'aktif' check (status in ('aktif', 'nonaktif')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pastikan kolom class_id & foreign key tetap sinkron jika tabel students sudah ada sebelumnya
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'students' and column_name = 'class_id'
  ) then
    alter table public.students add column class_id uuid references public.classes(id) on delete set null;
  end if;
end $$;

-- 5. Tabel Absensi Karyawan (Relasi N:1 ke Profiles)
create table if not exists public.employee_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tanggal date not null default current_date,
  jam_masuk timestamptz,
  jam_pulang timestamptz,
  status text not null check (status in ('hadir', 'izin', 'sakit', 'dinas_luar')),
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, tanggal)
);

-- 6. Tabel Absensi Siswa (Relasi N:1 ke Students & Profiles sebagai pencatat/guru)
create table if not exists public.student_attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  tanggal date not null default current_date,
  status text not null check (status in ('hadir', 'sakit', 'izin', 'alpa')),
  catatan text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, tanggal)
);

-- 7. Seed Master Jurusan (Idempotent)
insert into public.jurusan (code, nama_jurusan, bidang_keahlian)
values
  ('TKJ', 'Teknik Komputer dan Jaringan', 'Teknologi Informasi & Desain Kreatif'),
  ('DKV', 'Desain Komunikasi Visual', 'Teknologi Informasi & Desain Kreatif'),
  ('BC', 'Broadcasting dan Perfilman', 'Media Penyiaran & Bisnis Digital'),
  ('BD', 'Bisnis Digital', 'Media Penyiaran & Bisnis Digital'),
  ('AK', 'Akuntansi', 'Keuangan & Manajemen Perkantoran'),
  ('MPLB', 'Manajemen Perkantoran dan Layanan Bisnis', 'Keuangan & Manajemen Perkantoran')
on conflict (code) do update
  set nama_jurusan = excluded.nama_jurusan,
      bidang_keahlian = excluded.bidang_keahlian;

-- 8. Seed Kelas Awal untuk masing-masing jurusan (Idempotent)
insert into public.classes (nama_kelas, tingkat, jurusan_code)
values
  ('X TKJ 1', 'X', 'TKJ'),
  ('XI TKJ 1', 'XI', 'TKJ'),
  ('X DKV 1', 'X', 'DKV'),
  ('X AK 1', 'X', 'AK'),
  ('X BC 1', 'X', 'BC'),
  ('X MPLB 1', 'X', 'MPLB'),
  ('X BD 1', 'X', 'BD')
on conflict (nama_kelas) do nothing;

-- 9. Trigger Sinkronisasi Otomatis Relasi Siswa <-> Kelas
create or replace function public.sync_student_class_relation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  found_class public.classes%rowtype;
  inferred_tingkat text;
begin
  if new.class_id is not null then
    select * into found_class from public.classes where id = new.class_id limit 1;
    if found_class.id is not null then
      new.kelas := found_class.nama_kelas;
      new.jurusan := found_class.jurusan_code;
      return new;
    end if;
  end if;

  if new.kelas is not null and trim(new.kelas) <> '' then
    select * into found_class
    from public.classes
    where lower(nama_kelas) = lower(trim(new.kelas))
    limit 1;

    if found_class.id is null then
      if upper(trim(new.kelas)) like 'XII%' then
        inferred_tingkat := 'XII';
      elsif upper(trim(new.kelas)) like 'XI%' then
        inferred_tingkat := 'XI';
      else
        inferred_tingkat := 'X';
      end if;

      insert into public.classes (nama_kelas, tingkat, jurusan_code)
      values (upper(trim(new.kelas)), inferred_tingkat, new.jurusan)
      on conflict (nama_kelas) do update set jurusan_code = excluded.jurusan_code
      returning * into found_class;
    end if;

    new.class_id := found_class.id;
    new.kelas := found_class.nama_kelas;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_student_class on public.students;
create trigger trg_sync_student_class
  before insert or update on public.students
  for each row execute procedure public.sync_student_class_relation();

-- 10. Trigger User Pertama di Supabase Auth Otomatis Menjadi ADMIN
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  existing_count integer;
  assigned_role text;
begin
  select count(*) into existing_count from public.profiles;

  if existing_count = 0 then
    assigned_role := 'admin';
  else
    assigned_role := coalesce(new.raw_user_meta_data->>'role', 'tenaga_kependidikan');
    if assigned_role not in ('admin', 'guru', 'tenaga_kependidikan') then
      assigned_role := 'tenaga_kependidikan';
    end if;
  end if;

  insert into public.profiles (id, email, full_name, nip, jabatan, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data->>'nip', ''),
    nullif(new.raw_user_meta_data->>'jabatan', ''),
    assigned_role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 11. Helper Function Cek Role di RLS
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

-- 12. Aktifkan Row Level Security (RLS)
alter table public.jurusan enable row level security;
alter table public.classes enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.employee_attendance enable row level security;
alter table public.student_attendance enable row level security;

-- Policies: jurusan
drop policy if exists "Authenticated users read jurusan" on public.jurusan;
create policy "Authenticated users read jurusan"
  on public.jurusan for select
  to authenticated
  using (true);

-- Policies: classes
drop policy if exists "Authenticated users read classes" on public.classes;
create policy "Authenticated users read classes"
  on public.classes for select
  to authenticated
  using (true);

drop policy if exists "Admin manages classes" on public.classes;
create policy "Admin manages classes"
  on public.classes for all
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Policies: profiles
drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can update own basic profile" on public.profiles;
create policy "Users can update own basic profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Admin full access profiles" on public.profiles;
create policy "Admin full access profiles"
  on public.profiles for all
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Policies: students
drop policy if exists "Authenticated users can view students" on public.students;
create policy "Authenticated users can view students"
  on public.students for select
  to authenticated
  using (true);

drop policy if exists "Admin manages students" on public.students;
create policy "Admin manages students"
  on public.students for all
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Policies: employee_attendance
drop policy if exists "Employees read own or admin reads all" on public.employee_attendance;
create policy "Employees read own or admin reads all"
  on public.employee_attendance for select
  to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Employees insert own attendance" on public.employee_attendance;
create policy "Employees insert own attendance"
  on public.employee_attendance for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Employees update own attendance" on public.employee_attendance;
create policy "Employees update own attendance"
  on public.employee_attendance for update
  to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

-- Policies: student_attendance
drop policy if exists "Admin and Guru read student attendance" on public.student_attendance;
create policy "Admin and Guru read student attendance"
  on public.student_attendance for select
  to authenticated
  using (public.current_user_role() in ('admin', 'guru'));

drop policy if exists "Admin and Guru write student attendance" on public.student_attendance;
create policy "Admin and Guru write student attendance"
  on public.student_attendance for insert
  to authenticated
  with check (public.current_user_role() in ('admin', 'guru'));

drop policy if exists "Admin and Guru update student attendance" on public.student_attendance;
create policy "Admin and Guru update student attendance"
  on public.student_attendance for update
  to authenticated
  using (public.current_user_role() in ('admin', 'guru'))
  with check (public.current_user_role() in ('admin', 'guru'));

-- 13. View Relasional untuk Rekap Cepat
create or replace view public.v_student_attendance_detail as
select
  sa.id,
  sa.tanggal,
  sa.status,
  sa.catatan,
  s.id as student_id,
  s.nis,
  s.nama as nama_siswa,
  s.kelas,
  j.code as jurusan_code,
  j.nama_jurusan,
  c.tingkat,
  p.full_name as dicatat_oleh
from public.student_attendance sa
join public.students s on s.id = sa.student_id
join public.jurusan j on j.code = s.jurusan
left join public.classes c on c.id = s.class_id
left join public.profiles p on p.id = sa.recorded_by;

create or replace view public.v_employee_attendance_detail as
select
  ea.id,
  ea.tanggal,
  ea.jam_masuk,
  ea.jam_pulang,
  ea.status,
  ea.catatan,
  p.id as user_id,
  p.full_name,
  p.email,
  p.nip,
  p.jabatan,
  p.role
from public.employee_attendance ea
join public.profiles p on p.id = ea.user_id;

-- 14. Index untuk performa query relasional
create index if not exists idx_classes_jurusan on public.classes(jurusan_code);
create index if not exists idx_students_class_id on public.students(class_id);
create index if not exists idx_students_kelas_jurusan on public.students(kelas, jurusan);
create index if not exists idx_employee_attendance_tanggal on public.employee_attendance(tanggal);
create index if not exists idx_employee_attendance_user_tanggal on public.employee_attendance(user_id, tanggal);
create index if not exists idx_student_attendance_tanggal on public.student_attendance(tanggal);
create index if not exists idx_student_attendance_student_tanggal on public.student_attendance(student_id, tanggal);

-- 15. Grant Hak Akses Schema & Tabel ke Role Supabase (anon, authenticated, service_role)
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.jurusan, public.classes to anon;

