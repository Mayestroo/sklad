'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ImpersonationBanner } from './ImpersonationBanner';
import LoginPage from '@/app/[locale]/(auth)/login/page';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  const isAuthPage = pathname?.includes('/login') || pathname?.includes('/register');
  const isAdminPage = pathname?.includes('/admin');

  // If on login or register route, render children without sidebar/header
  if (isAuthPage) {
    return <>{children}</>;
  }

  // While checking stored auth session, show clean loading state
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-bg-primary)',
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--font-medium)',
        }}
      >
        Yuklanmoqda...
      </div>
    );
  }

  // If unauthenticated, display full-screen standalone Login page
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // If on superadmin page, render dedicated superadmin layout without tenant sidebar
  if (isAdminPage) {
    return <>{children}</>;
  }

  // Main Platform Layout (renders only when authenticated on tenant pages)
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--color-bg-primary)' }}>
      {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div style={{ marginLeft: 'var(--sidebar-width)', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <ImpersonationBanner />
        <Header />
        <main style={{ flex: 1, padding: 'var(--space-6)', maxWidth: '100%', width: '100%', boxSizing: 'border-box' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
