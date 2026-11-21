'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter, Link } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { ShieldCheck, Building2, CreditCard, LifeBuoy, Megaphone, HardDrive, LogOut, ExternalLink, Menu, X } from 'lucide-react';

interface SuperAdminLayoutProps {
  children: ReactNode;
}

/**
 * Platform owner area. Uses the same shell classes as the company app
 * (globals.css: fixed sidebar from 1024 px, a drawer below it), so it works on
 * a phone too.
 */
export default function SuperAdminLayout({ children }: SuperAdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { user, isAuthenticated, isLoading, logout, hasRole } = useAuth();
  // A boolean, not hasRole itself: hasRole is a new function on every render
  // and would re-run the redirect each time.
  const isSuperAdmin = hasRole('super_admin');
  const [navOpen, setNavOpen] = useState(false);
  const [navPath, setNavPath] = useState(pathname);
  // The drawer closes when the page changes.
  if (navPath !== pathname) {
    setNavPath(pathname);
    if (navOpen) setNavOpen(false);
  }

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) router.push('/login');
      else if (!isSuperAdmin) router.push('/');
    }
  }, [isAuthenticated, isLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  if (isLoading || !isAuthenticated || !isSuperAdmin) {
    return (
      <div role="status" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
        {isRu ? 'Загрузка…' : 'Yuklanmoqda…'}
      </div>
    );
  }

  const navItems = [
    { href: '/admin', label: isRu ? 'Компании' : 'Korxonalar', icon: Building2, exact: true },
    { href: '/admin/billing', label: isRu ? 'Тарифы и подписки' : 'Tariflar va obunalar', icon: CreditCard, exact: false },
    { href: '/admin/tickets', label: isRu ? 'Обращения' : 'Murojaatlar', icon: LifeBuoy, exact: false },
    { href: '/admin/announcements', label: isRu ? 'Объявления' : 'E’lonlar', icon: Megaphone, exact: false },
    { href: '/admin/security', label: isRu ? 'Журнал и бэкапы' : 'Jurnal va zaxira nusxalar', icon: HardDrive, exact: false },
  ];

  return (
    <div className="app-shell">
      <a href="#admin-content" className="app-skip-link">
        {isRu ? 'Перейти к содержимому' : 'Asosiy qismga o‘tish'}
      </a>

      <aside className={`app-sidebar${navOpen ? ' is-open' : ''}`} aria-label={isRu ? 'Меню платформы' : 'Platforma menyusi'}>
        <div style={{ height: 'var(--header-height)', padding: '0 var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', borderBottom: '1px solid var(--color-border-light)' }}>
          <div aria-hidden style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-inverse)', flexShrink: 0 }}>
            <ShieldCheck size={22} />
          </div>
          <div style={{ minWidth: 0, flex: 1, fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
            Sklad
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Управление платформой' : 'Platforma boshqaruvi'}</div>
          </div>
          <button type="button" className="app-sidebar-close" onClick={() => setNavOpen(false)} aria-label={isRu ? 'Закрыть меню' : 'Menyuni yopish'} title={isRu ? 'Закрыть меню' : 'Menyuni yopish'}>
            <X size={18} aria-hidden />
          </button>
        </div>

        <nav style={{ padding: 'var(--space-4) var(--space-3)', flex: 1, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className="app-nav-link"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  minHeight: 40,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: isActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                  textDecoration: 'none',
                  color: isActive ? 'var(--color-primary-700)' : 'var(--color-text-secondary)',
                  backgroundColor: isActive ? 'var(--color-primary-50)' : 'transparent',
                }}
              >
                <Icon size={18} aria-hidden style={{ flexShrink: 0 }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: 'var(--space-4)', borderTop: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
            <div aria-hidden style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', flexShrink: 0 }}>
              {user?.firstName?.[0]?.toUpperCase() || 'S'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.firstName} {user?.lastName}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label={isRu ? 'Выйти' : 'Chiqish'}
            title={isRu ? 'Выйти' : 'Chiqish'}
            style={{ background: 'none', border: 'none', color: 'var(--color-error-700)', cursor: 'pointer', width: 36, height: 36, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <LogOut size={16} aria-hidden />
          </button>
        </div>
      </aside>
      {navOpen && <div className="app-nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden />}

      <div className="app-shell-main">
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
            <button
              type="button"
              className="app-header-menu"
              onClick={() => setNavOpen(true)}
              aria-label={isRu ? 'Открыть меню' : 'Menyuni ochish'}
              title={isRu ? 'Открыть меню' : 'Menyuni ochish'}
              style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Menu size={18} aria-hidden />
            </button>
            <span className="sa-owner-badge" style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-700)', border: '1px solid var(--color-primary-100)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', whiteSpace: 'nowrap' }}>
              {isRu ? 'Владелец платформы' : 'Platforma egasi'}
            </span>
          </div>

          <div className="app-header-actions">
            <Link
              href="/"
              target="_blank"
              aria-label={isRu ? 'Портал клиента (в новой вкладке)' : 'Mijoz portali (yangi oynada)'}
              title={isRu ? 'Портал клиента' : 'Mijoz portali'}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 36, fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', textDecoration: 'none', padding: '6px 12px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
            >
              <ExternalLink size={13} aria-hidden />
              <span className="sa-portal-text">{isRu ? 'Портал клиента' : 'Mijoz portali'}</span>
            </Link>
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </header>

        <main id="admin-content" tabIndex={-1} className="app-shell-content">
          {children}
        </main>
      </div>
    </div>
  );
}
