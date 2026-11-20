'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ImpersonationBanner } from './ImpersonationBanner';
import { GoToPalette } from './GoToPalette';
import { ShortcutsHelp, isTypingTarget } from './ShortcutsHelp';
import LoginPage from '@/app/[locale]/(auth)/login/page';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const tUx = useTranslations('ux');
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Close the phone drawer when the route changes (adjusted during render).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (navOpen) setNavOpen(false);
  }

  // Global shortcuts: Ctrl/⌘+K opens "Go to"; Esc closes the phone drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target) && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === 'Escape' && navOpen) {
        setNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

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
        role="status"
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
        {tUx('loading')}
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

  return (
    <div className="app-shell">
      <a href="#main-content" className="app-skip-link">
        {tUx('skipToContent')}
      </a>
      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen && <div className="app-nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden />}

      <div className="app-shell-main">
        <ImpersonationBanner />
        <Header onOpenMenu={() => setNavOpen(true)} onOpenGoTo={() => setPaletteOpen(true)} />
        <main id="main-content" tabIndex={-1} className="app-shell-content">
          {children}
        </main>
      </div>
      <GoToPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
