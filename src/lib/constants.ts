import type {
  EmployeeAttendanceStatus,
  JurusanCode,
  StudentAttendanceStatus,
  UserRole,
} from '../types';

export interface JurusanInfo {
  code: JurusanCode;
  name: string;
  bidang: string;
  description: string;
}

export const BIDANG_KEAHLIAN = [
  {
    id: 'teknologi-kreatif',
    title: '01. Bidang Teknologi Informasi & Desain Kreatif',
    subtitle: 'Infrastruktur jaringan enterprise, sistem cloud, dan komunikasi visual modern.',
    programs: ['TKJ', 'DKV'] as JurusanCode[],
  },
  {
    id: 'media-bisnis-digital',
    title: '02. Bidang Media Penyiaran & Bisnis Digital',
    subtitle: 'Produksi siaran profesional, sinematografi, pemasaran digital, dan e-commerce.',
    programs: ['BC', 'BD'] as JurusanCode[],
  },
  {
    id: 'keuangan-perkantoran',
    title: '03. Bidang Keuangan & Manajemen Perkantoran',
    subtitle: 'Tata kelola akuntansi terkomputerisasi dan administrasi perkantoran modern.',
    programs: ['AK', 'MPLB'] as JurusanCode[],
  },
];

export const JURUSAN_LIST: JurusanInfo[] = [
  {
    code: 'TKJ',
    name: 'Teknik Komputer dan Jaringan',
    bidang: 'Teknologi Informasi & Desain Kreatif',
    description:
      'Merancang, mengelola, dan mengamankan infrastruktur jaringan komputer, server Linux, fiber optik, serta layanan komputasi awan.',
  },
  {
    code: 'DKV',
    name: 'Desain Komunikasi Visual',
    bidang: 'Teknologi Informasi & Desain Kreatif',
    description:
      'Mengembangkan identitas merek, ilustrasi digital, fotografi komersial, desain antarmuka, dan produksi media visual lintas platform.',
  },
  {
    code: 'BC',
    name: 'Broadcasting dan Perfilman',
    bidang: 'Media Penyiaran & Bisnis Digital',
    description:
      'Menguasai tata kamera, penyiaran studio, penyutradaraan, penulisan naskah, tata suara, hingga pasca-produksi video profesional.',
  },
  {
    code: 'BD',
    name: 'Bisnis Digital',
    bidang: 'Media Penyiaran & Bisnis Digital',
    description:
      'Membangun strategi pemasaran digital, analitik pasar, pengelolaan toko daring, dan pengembangan model usaha berbasis teknologi.',
  },
  {
    code: 'AK',
    name: 'Akuntansi',
    bidang: 'Keuangan & Manajemen Perkantoran',
    description:
      'Menyusun laporan keuangan perusahaan, perpajakan, audit dasar, dan sistem akuntansi terkomputerisasi sesuai standar industri.',
  },
  {
    code: 'MPLB',
    name: 'Manajemen Perkantoran dan Layanan Bisnis',
    bidang: 'Keuangan & Manajemen Perkantoran',
    description:
      'Mengelola kesekretariatan eksekutif, kearsipan digital, korespondensi bisnis, dan layanan pelanggan berstandar korporasi.',
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  guru: 'Guru',
  tenaga_kependidikan: 'Tenaga Kependidikan',
};

export const EMPLOYEE_STATUS_META: Record<
  EmployeeAttendanceStatus,
  { label: string; textClass: string; bgClass: string; borderClass: string }
> = {
  hadir: {
    label: 'Hadir',
    textClass: 'text-emerald-800',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
  },
  izin: {
    label: 'Izin',
    textClass: 'text-amber-800',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
  },
  sakit: {
    label: 'Sakit',
    textClass: 'text-sky-800',
    bgClass: 'bg-sky-50',
    borderClass: 'border-sky-200',
  },
  dinas_luar: {
    label: 'Dinas Luar',
    textClass: 'text-red-800',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
  },
};

export const STUDENT_STATUS_META: Record<
  StudentAttendanceStatus,
  { label: string; shortLabel: string; textClass: string; bgClass: string; borderClass: string }
> = {
  hadir: {
    label: 'Hadir',
    shortLabel: 'H',
    textClass: 'text-emerald-800',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
  },
  sakit: {
    label: 'Sakit',
    shortLabel: 'S',
    textClass: 'text-sky-800',
    bgClass: 'bg-sky-50',
    borderClass: 'border-sky-200',
  },
  izin: {
    label: 'Izin',
    shortLabel: 'I',
    textClass: 'text-amber-800',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
  },
  alpa: {
    label: 'Alpa',
    shortLabel: 'A',
    textClass: 'text-red-800',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
  },
};

export function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentMonthPrefix(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatIndonesianDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatTimeOnly(isoStr: string | null): string {
  if (!isoStr) return '—';
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ].join('\n');

  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
