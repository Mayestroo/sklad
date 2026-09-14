'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter, Link } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import {
  ShieldCheck,
  Building2,
  CreditCard,
  LifeBuoy,
  Megaphone,
  HardDrive,
  LogOut,
  ExternalLink,
} from 'lucide-react';

interface SuperAdminLayoutProps {
  children: ReactNode;
}

export default function SuperAdminLayout({ children }: SuperAdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { user, isAuthenticated, isLoading, logout, hasRole } = useAuth();

  // Guard: Must be authenticated and have super_admin role
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push('/login');
      } else if (!hasRole('super_admin')) {
        router.push('/');
      }
    }
  }, [isAuthenticated, isLoading, user]);

  if (isLoading || !isAuthenticated || !hasRole('super_admin')) {
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
          fontFamily: 'var(--font-sans)',
        }}
      >
        Yuklanmoqda...
      </div>
    );
  }

  const navItems = [
    {
      href: '/admin',
      label: isRu ? 'Предприятия (Tenants)' : 'Korxonalar (Tenants)',
      icon: Building2,
      exact: true,
    },
    {
      href: '/admin/billing',
      label: isRu ? 'Тарифы и Подписки' : 'Tariflar va Obunalar',
      icon: CreditCard,
      exact: false,
    },
    {
      href: '/admin/tickets',
      label: isRu ? 'Техподдержка' : 'Qo‘llab-quvvatlash',
      icon: LifeBuoy,
      exact: false,
    },
    {
      href: '/admin/announcements',
      label: isRu ? 'Оповещения системы' : 'Tizim Bildirishnomalari',
      icon: Megaphone,
      exact: false,
    },
    {
      href: '/admin/security',
      label: isRu ? 'Аудит и Бэкапы' : 'Audit va Zaxira (Backup)',
      icon: HardDrive,
      exact: false,
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-primary)',
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Superadmin Sidebar — matches Platform design system */}
      <aside
        style={{
          width: 'var(--sidebar-width)',
          backgroundColor: 'var(--color-bg-sidebar)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 40,
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            height: 'var(--header-height)',
            padding: '0 var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            borderBottom: '1px solid var(--color-border-light)',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={22} />
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div
              style={{
                fontWeight: 'var(--font-bold)',
                fontSize: 'var(--text-base)',
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              Sklad SuperAdmin
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-primary-600)',
                fontWeight: 'var(--font-semibold)',
                marginTop: '2px',
              }}
            >
              SaaS Owner Console
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav
          style={{
            padding: 'var(--space-4) var(--space-3)',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              padding: '0 var(--space-2) var(--space-2)',
              fontSize: '11px',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {isRu ? 'Управление платформой' : 'Platforma Boshqaruvi'}
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: isActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                  textDecoration: 'none',
                  color: isActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                  backgroundColor: isActive ? 'var(--color-primary-50)' : 'transparent',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }
                }}
              >
                <Icon
                  size={18}
                  style={{
                    color: isActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* User profile & Logout */}
        <div
          style={{
            padding: 'var(--space-4)',
            borderTop: '1px solid var(--color-border-light)',
            backgroundColor: 'var(--color-bg-sidebar)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-100)',
                color: 'var(--color-primary-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'var(--font-semibold)',
                fontSize: 'var(--text-sm)',
                flexShrink: 0,
              }}
            >
              {user?.firstName?.[0]?.toUpperCase() || 'S'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-semibold)',
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.firstName} {user?.lastName}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-tertiary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.email}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            title={isRu ? 'Выйти' : 'Chiqish'}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-error-600)',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color var(--transition-fast)',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-error-50)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main SuperAdmin Content Area */}
      <div
        style={{
          marginLeft: 'var(--sidebar-width)',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {/* Top Header Bar */}
        <header
          style={{
            height: 'var(--header-height)',
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 var(--space-6)',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          {/* Header Title & Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-50)',
                color: 'var(--color-primary-600)',
                border: '1px solid var(--color-primary-100)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-bold)',
                letterSpacing: '0.05em',
              }}
            >
              PLATFORM OWNER
            </span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>•</span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-medium)' }}>
              Sklad ERP Global Multi-Tenant Core
            </span>
          </div>

          {/* Right Controls: Customer portal link, ThemeSwitcher, LanguageSwitcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Link
              href="/"
              target="_blank"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                transition: 'all var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
            >
              <ExternalLink size={13} />
              <span>{isRu ? 'Портал клиента' : 'Mijoz portali'}</span>
            </Link>

            {/* Theme Switcher (Light / Dark) */}
            <ThemeSwitcher />

            {/* Language Switcher (UZ / RU) */}
            <LanguageSwitcher />
          </div>
        </header>

        {/* Page Content */}
        <main
          style={{
            flex: 1,
            padding: 'var(--space-6)',
            maxWidth: '100%',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
