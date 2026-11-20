import React, { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../lib/constants';
import type { UserRole } from '../types';

interface NavSubItem {
  label: string;
  to: string;
  roles: UserRole[];
}

interface NavItem {
  id: string;
  label: string;
  to?: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  children?: NavSubItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    to: '/app',
    icon: LayoutDashboard,
    roles: ['admin', 'guru', 'tenaga_kependidikan'],
  },
  {
    id: 'absensi-karyawan',
    label: 'Absensi Karyawan',
    to: '/app/absensi-karyawan',
    icon: UserCheck,
    roles: ['admin', 'guru', 'tenaga_kependidikan'],
  },
  {
    id: 'absensi-siswa',
    label: 'Absensi Siswa',
    to: '/app/absensi-siswa',
    icon: ClipboardCheck,
    roles: ['admin', 'guru'],
  },
  {
    id: 'rekap-absensi',
    label: 'Rekap Absensi',
    icon: BarChart3,
    roles: ['admin', 'guru'],
    children: [
      {
        label: 'Absensi Karyawan',
        to: '/app/rekap/karyawan',
        roles: ['admin'],
      },
      {
        label: 'Absensi Siswa',
        to: '/app/rekap/siswa',
        roles: ['admin', 'guru'],
      },
    ],
  },
  {
    id: 'data-siswa',
    label: 'Data Siswa',
    to: '/app/data-siswa',
    icon: GraduationCap,
    roles: ['admin'],
  },
  {
    id: 'user-management',
    label: 'User Management',
    to: '/app/users',
    icon: Users,
    roles: ['admin'],
  },
];

const ROUTE_TITLES: Record<string, string> = {
  '/app': 'Dashboard',
  '/app/absensi-karyawan': 'Absensi Karyawan',
  '/app/absensi-siswa': 'Absensi Siswa',
  '/app/rekap/karyawan': 'Rekap Absensi Karyawan',
  '/app/rekap/siswa': 'Rekap Absensi Siswa',
  '/app/data-siswa': 'Data Siswa',
  '/app/users': 'User Management',
};

export function AppShell() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rekapExpanded, setRekapExpanded] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const role: UserRole = profile?.role || 'tenaga_kependidikan';

  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => {
      if (!item.children) return item;
      return {
        ...item,
        children: item.children.filter((sub) => sub.roles.includes(role)),
      };
    });
  }, [role]);

  const currentPageTitle = useMemo(() => {
    if (ROUTE_TITLES[location.pathname]) {
      return ROUTE_TITLES[location.pathname];
    }
    if (location.pathname.startsWith('/app/rekap/siswa/')) {
      const kelasParam = decodeURIComponent(location.pathname.replace('/app/rekap/siswa/', ''));
      return `Rekap Absensi Siswa · ${kelasParam.replace(/-/g, ' ')}`;
    }
    if (location.pathname.startsWith('/app/data-siswa/')) {
      return 'Detail Data Siswa';
    }
    return 'Portal Absensi';
  }, [location.pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  const renderNavContent = () => (
    <div className="flex h-full flex-col bg-white">
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-5">
        <Link to="/" className="flex items-center gap-2.5 whitespace-nowrap">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-600 text-sm font-extrabold text-white">
            PU
          </span>
          <span className="text-base font-bold tracking-tight text-neutral-900">
            SMK Prima Unggul
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 lg:hidden"
          aria-label="Tutup menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Role Context Strip */}
      <div className="border-b border-neutral-200 bg-red-50/50 px-5 py-3.5">
        <p className="text-xs font-medium text-neutral-500">Peran Aktif</p>
        <p className="mt-0.5 text-sm font-semibold text-red-700">{ROLE_LABELS[role]}</p>
      </div>

      {/* Sidebar Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Menu Utama">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          if (item.children && item.children.length > 0) {
            const isChildActive = item.children.some((sub) =>
              location.pathname.startsWith(sub.to),
            );
            return (
              <div key={item.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setRekapExpanded((prev) => !prev)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isChildActive
                      ? 'bg-red-50 text-red-700'
                      : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  <span className="flex items-center gap-3 whitespace-nowrap">
                    <Icon className={`h-4 w-4 shrink-0 ${isChildActive ? 'text-red-600' : 'text-neutral-500'}`} />
                    <span>{item.label}</span>
                  </span>
                  {rekapExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                  )}
                </button>

                {rekapExpanded && (
                  <div className="ml-4 space-y-1 border-l border-neutral-200 pl-3">
                    {item.children.map((sub) => (
                      <NavLink
                        key={sub.to}
                        to={sub.to}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          `block rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                            isActive
                              ? 'bg-red-600 text-white'
                              : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                          }`
                        }
                      >
                        {sub.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.id}
              to={item.to!}
              end={item.to === '/app'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-neutral-500'}`} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Footer Link */}
      <div className="border-t border-neutral-200 px-5 py-3.5 text-xs text-neutral-500">
        <Link to="/" className="font-medium text-neutral-600 transition-colors hover:text-red-600">
          Kembali ke Beranda Sekolah
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      {/* Desktop Fixed Left Sidebar */}
      <aside className="hidden w-[260px] shrink-0 border-r border-neutral-200 bg-white lg:block">
        <div className="sticky top-0 h-screen">{renderNavContent()}</div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-neutral-950/40"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 h-full w-[268px] border-r border-neutral-200 bg-white shadow-xl">
            {renderNavContent()}
          </aside>
        </div>
      )}

      {/* Main Content Wrapper */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar with Breadcrumb (left) and Logout Button (top-right) */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-neutral-200 p-2 text-neutral-700 hover:bg-neutral-50 lg:hidden"
              aria-label="Buka menu navigasi"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-neutral-400 sm:inline">Portal Absensi</span>
              <span className="hidden text-neutral-300 sm:inline">/</span>
              <h1 className="truncate font-semibold text-neutral-900">{currentPageTitle}</h1>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden text-right sm:block">
              <p className="max-w-[200px] truncate text-sm font-semibold text-neutral-900">
                {profile?.full_name || 'Pengguna'}
              </p>
              <p className="text-xs text-neutral-500">
                {profile?.jabatan || ROLE_LABELS[role]}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-600 hover:text-white whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              <span>{loggingOut ? 'Keluar...' : 'Logout'}</span>
            </button>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="mx-auto w-full max-w-[1280px] flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
