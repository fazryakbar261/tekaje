/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/app/DashboardPage';
import { EmployeeAttendancePage } from './pages/app/EmployeeAttendancePage';
import { EmployeeRecapPage } from './pages/app/EmployeeRecapPage';
import { StudentAttendancePage } from './pages/app/StudentAttendancePage';
import { StudentDataPage } from './pages/app/StudentDataPage';
import { StudentRecapPage } from './pages/app/StudentRecapPage';
import { UserManagementPage } from './pages/app/UserManagementPage';
import type { UserRole } from './types';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-sm font-medium text-neutral-600">
        Memuat sesi pengguna...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-neutral-500">
        Memverifikasi hak akses...
      </div>
    );
  }

  if (!profile || !allowedRoles.includes(profile.role)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="absensi-karyawan" element={<EmployeeAttendancePage />} />
            <Route
              path="absensi-siswa"
              element={
                <RoleGuard allowedRoles={['admin', 'guru']}>
                  <StudentAttendancePage />
                </RoleGuard>
              }
            />
            <Route
              path="rekap/karyawan"
              element={
                <RoleGuard allowedRoles={['admin']}>
                  <EmployeeRecapPage />
                </RoleGuard>
              }
            />
            <Route
              path="rekap/siswa"
              element={
                <RoleGuard allowedRoles={['admin', 'guru']}>
                  <StudentRecapPage />
                </RoleGuard>
              }
            />
            <Route
              path="rekap/siswa/:kelas"
              element={
                <RoleGuard allowedRoles={['admin', 'guru']}>
                  <StudentRecapPage />
                </RoleGuard>
              }
            />
            <Route
              path="data-siswa"
              element={
                <RoleGuard allowedRoles={['admin']}>
                  <StudentDataPage />
                </RoleGuard>
              }
            />
            <Route
              path="data-siswa/:id"
              element={
                <RoleGuard allowedRoles={['admin']}>
                  <StudentDataPage />
                </RoleGuard>
              }
            />
            <Route
              path="users"
              element={
                <RoleGuard allowedRoles={['admin']}>
                  <UserManagementPage />
                </RoleGuard>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
