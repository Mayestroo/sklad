'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter, Link } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import {
  ShieldCheck,
  Building2,
  CreditCard,
  LifeBuoy,
  Megaphone,
  HardDrive,
  LogOut,
  Globe,
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
          backgroundColor: '#0f172a',
          color: '#94a3b8',
          fontSize: '14px',
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
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#090d16', color: '#f8fafc' }}>
      {/* Superadmin Dark Slate Sidebar */}
      <aside
        style={{
          width: '260px',
          backgroundColor: '#0f172a',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 40,
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            height: '64px',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#6366f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 0 12px rgba(99, 102, 241, 0.4)',
            }}
          >
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#ffffff', letterSpacing: '-0.02em' }}>
              Sklad SuperAdmin
            </div>
            <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600 }}>
              SaaS Owner Console
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav style={{ padding: '16px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ padding: '0 8px 8px', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  textDecoration: 'none',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  backgroundColor: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                  border: isActive ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={18} style={{ color: isActive ? '#818cf8' : '#64748b' }} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User profile & Logout */}
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid #1e293b',
            backgroundColor: '#0c1322',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                backgroundColor: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '13px',
                color: '#e2e8f0',
              }}
            >
              {user?.firstName?.[0] || 'S'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.firstName} {user?.lastName}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.email}
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            title={isRu ? 'Выйти' : 'Chiqish'}
            style={{
              background: 'none',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main SuperAdmin Content Area */}
      <div style={{ marginLeft: '260px', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header Bar */}
        <header
          style={{
            height: '64px',
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                color: '#818cf8',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.05em',
              }}
            >
              PLATFORM OWNER
            </span>
            <span style={{ fontSize: '13px', color: '#64748b' }}>•</span>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>
              Sklad ERP Global Multi-Tenant Core
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link
              href="/"
              target="_blank"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#94a3b8',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
              }}
            >
              <ExternalLink size={13} />
              <span>{isRu ? 'Портал клиента' : 'Mijoz portali'}</span>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main style={{ flex: 1, padding: '32px', backgroundColor: '#090d16' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
