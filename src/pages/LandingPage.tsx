import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BIDANG_KEAHLIAN, JURUSAN_LIST } from '../lib/constants';

export function LandingPage() {
  const { session } = useAuth();
  const [heroImgError, setHeroImgError] = useState(false);
  const [labImgError, setLabImgError] = useState(false);
  const [studioImgError, setStudioImgError] = useState(false);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Top Bar Contract: Brand — 4 nav links — 1 primary CTA */}
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-neutral-900 whitespace-nowrap shrink-0"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-xs font-extrabold text-white">
              PU
            </span>
            <span>SMK Prima Unggul</span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-600">
            <a
              href="#profil"
              className="transition-colors hover:text-red-600 whitespace-nowrap shrink-0"
            >
              Profil Sekolah
            </a>
            <a
              href="#jurusan"
              className="transition-colors hover:text-red-600 whitespace-nowrap shrink-0"
            >
              Program Jurusan
            </a>
            <a
              href="#fasilitas"
              className="transition-colors hover:text-red-600 whitespace-nowrap shrink-0"
            >
              Fasilitas Praktik
            </a>
            <a
              href="#portal"
              className="transition-colors hover:text-red-600 whitespace-nowrap shrink-0"
            >
              Portal Absensi
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <Link
              to={session ? '/app' : '/login'}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 whitespace-nowrap shrink-0"
            >
              <span>{session ? 'Buka Aplikasi' : 'Masuk Sistem'}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="profil" className="border-b border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="flex flex-col justify-center lg:col-span-6">
              <p className="text-sm font-semibold text-red-600">
                Sekolah Menengah Kejuruan Terakreditasi A
              </p>
              <h1 className="mt-3 text-[clamp(2.25rem,4vw,3.5rem)] font-extrabold leading-[1.1] tracking-tight text-neutral-900">
                Pendidikan Vokasi Unggul Berbasis Industri &amp; Disiplin Digital
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
                SMK Prima Unggul membekali peserta didik dengan kompetensi kejuruan siap kerja
                melalui 3 bidang keahlian utama yang menaungi 6 program jurusan: TKJ, DKV, AK, BC,
                MPLB, dan BD, didukung sistem manajemen kehadiran siswa dan karyawan terpadu.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to={session ? '/app' : '/login'}
                  className="inline-flex items-center gap-2.5 rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 whitespace-nowrap shrink-0"
                >
                  <span>{session ? 'Masuk ke Dashboard' : 'Masuk ke Portal Absensi'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#jurusan"
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-400 hover:bg-neutral-50 whitespace-nowrap shrink-0"
                >
                  Lihat 6 Program Jurusan
                </a>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-72 w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 sm:h-96 lg:h-full lg:min-h-[420px]">
                {!heroImgError ? (
                  <img
                    src="/src/assets/images/hero_smk_campus_1795061349747.jpg"
                    alt="Gedung Kampus SMK Prima Unggul"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-red-800 to-neutral-900 p-8 text-center text-white">
                    <Building2 className="h-12 w-12 text-red-200" />
                    <p className="mt-3 text-lg font-bold">Kampus SMK Prima Unggul</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4-column Key Metrics Strip */}
          <div className="mt-12 grid grid-cols-2 gap-6 border-t border-neutral-200 pt-8 md:grid-cols-4">
            <div>
              <p className="font-mono text-2xl font-bold text-red-600 tabular-nums sm:text-3xl">
                03
              </p>
              <p className="mt-1 text-sm font-semibold text-neutral-900">Bidang Keahlian</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Teknologi, Media Digital, &amp; Bisnis
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-bold text-red-600 tabular-nums sm:text-3xl">
                06
              </p>
              <p className="mt-1 text-sm font-semibold text-neutral-900">Kompetensi Jurusan</p>
              <p className="mt-0.5 text-xs text-neutral-500">TKJ, DKV, AK, BC, MPLB, dan BD</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-bold text-red-600 tabular-nums sm:text-3xl">
                100%
              </p>
              <p className="mt-1 text-sm font-semibold text-neutral-900">Kurikulum Berbasis Industri</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Praktik kerja lapangan &amp; sertifikasi
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-bold text-red-600 tabular-nums sm:text-3xl">
                24/7
              </p>
              <p className="mt-1 text-sm font-semibold text-neutral-900">Rekap Kehadiran Digital</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Tersinkronisasi langsung dengan Supabase
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Bidang & 6 Jurusan Section */}
      <section id="jurusan" className="border-b border-neutral-200 bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-red-600">Kompetensi Keahlian</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
              3 Rumpun Bidang &amp; 6 Jurusan Unggulan SMK Prima Unggul
            </h2>
            <p className="mt-3 text-base leading-relaxed text-neutral-600">
              Setiap jurusan dirancang bersama mitra industri untuk memastikan siswa menguasai
              keterampilan teknis, portofolio nyata, dan etika kerja profesional.
            </p>
          </div>

          <div className="mt-12 space-y-10">
            {BIDANG_KEAHLIAN.map((bidang) => {
              const programs = JURUSAN_LIST.filter((j) => bidang.programs.includes(j.code));
              return (
                <div
                  key={bidang.id}
                  className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-6 sm:p-8"
                >
                  <div className="border-b border-neutral-200 pb-4">
                    <h3 className="text-lg font-bold text-neutral-900">{bidang.title}</h3>
                    <p className="mt-1 text-sm text-neutral-600">{bidang.subtitle}</p>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                    {programs.map((jurusan) => (
                      <div
                        key={jurusan.code}
                        className="rounded-lg border border-neutral-200 bg-white p-5"
                      >
                        <div className="flex items-baseline justify-between gap-4">
                          <h4 className="text-base font-bold text-neutral-900">{jurusan.name}</h4>
                          <span className="font-mono text-sm font-semibold text-red-600 shrink-0">
                            {jurusan.code}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                          {jurusan.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Fasilitas Praktik Editorial Asymmetric Bento */}
      <section id="fasilitas" className="border-b border-neutral-200 bg-neutral-50 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5">
              <p className="text-sm font-semibold text-red-600">Fasilitas Pembelajaran</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
                Laboratorium Standar Industri di Setiap Kompetensi
              </h2>
              <p className="mt-4 text-base leading-relaxed text-neutral-600">
                Pembelajaran praktik di SMK Prima Unggul didukung perangkat keras jaringan router
                enterprise, workstation desain grafis, studio penyiaran multi-kamera, dan simulasi
                kantor akuntansi terpadu.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-neutral-700">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>Laboratorium Jaringan Cisco &amp; Mikrotik untuk jurusan TKJ</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>Studio Desain &amp; Fotografi Komersial untuk jurusan DKV</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>Studio Broadcasting On-Air &amp; Live Commerce untuk BC dan BD</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>Laboratorium Akuntansi &amp; Administrasi Modern untuk AK dan MPLB</span>
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:col-span-7">
              <figure className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="aspect-[4/3] w-full bg-neutral-200">
                  {!labImgError ? (
                    <img
                      src="/src/assets/images/lab_tkj_dkv_1795061349898.jpg"
                      alt="Laboratorium TKJ dan DKV SMK Prima Unggul"
                      referrerPolicy="no-referrer"
                      onError={() => setLabImgError(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-neutral-100 text-sm text-neutral-500">
                      Lab TKJ &amp; DKV
                    </div>
                  )}
                </div>
                <figcaption className="border-t border-neutral-200 p-4">
                  <p className="text-sm font-semibold text-neutral-900">
                    Laboratorium TKJ &amp; DKV
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Praktik topologi jaringan &amp; produksi desain visual
                  </p>
                </figcaption>
              </figure>

              <figure className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="aspect-[4/3] w-full bg-neutral-200">
                  {!studioImgError ? (
                    <img
                      src="/src/assets/images/studio_broadcast_bisnis_1795061350167.jpg"
                      alt="Studio Broadcasting dan Bisnis Digital SMK Prima Unggul"
                      referrerPolicy="no-referrer"
                      onError={() => setStudioImgError(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-neutral-100 text-sm text-neutral-500">
                      Studio BC &amp; BD
                    </div>
                  )}
                </div>
                <figcaption className="border-t border-neutral-200 p-4">
                  <p className="text-sm font-semibold text-neutral-900">
                    Studio Broadcasting &amp; Bisnis Digital
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Produksi siaran live, kamera sinema, &amp; pemasaran digital
                  </p>
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* Portal Absensi Role Matrix */}
      <section id="portal" className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-6 border-b border-neutral-200 pb-8 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-red-600">Sistem Absensi Terpadu</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
                Satu Portal untuk Kedisiplinan Siswa &amp; Karyawan
              </h2>
              <p className="mt-2 text-base text-neutral-600">
                Hak akses terpisah sesuai peran sekolah, terhubung langsung dengan autentikasi dan
                database Supabase.
              </p>
            </div>
            <Link
              to={session ? '/app' : '/login'}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 whitespace-nowrap shrink-0 self-start md:self-auto"
            >
              <span>{session ? 'Masuk ke /app' : 'Login Sekarang'}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-neutral-900">Administrator</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Mengelola data siswa (NIS, nama, kelas, jurusan), user management tersinkronisasi
                penuh dengan Supabase Auth, serta memantau rekap absensi siswa dan karyawan.
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-neutral-900">Guru</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Melakukan absensi karyawan secara mandiri, menginput absensi harian siswa per
                kelas/jurusan, serta meninjau rekap kehadiran siswa secara real-time.
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-neutral-900">Tenaga Kependidikan</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Mencatat kehadiran masuk dan pulang harian secara mandiri serta melihat riwayat
                absensi pribadi melalui dashboard terpusat.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-neutral-200 bg-neutral-50 py-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-bold text-neutral-900">SMK Prima Unggul</p>
            <p className="mt-1 text-xs text-neutral-500">
              Kompetensi Keahlian: TKJ · DKV · AK · BC · MPLB · BD
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-neutral-600">
            <a href="#profil" className="hover:text-red-600">
              Profil
            </a>
            <a href="#jurusan" className="hover:text-red-600">
              Jurusan
            </a>
            <Link to="/login" className="hover:text-red-600">
              Login Portal
            </Link>
            <span className="text-neutral-400">
              © {new Date().getFullYear()} SMK Prima Unggul
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
