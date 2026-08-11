'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import {
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
  PackageCheck,
  Package,
  UserCheck,
  Wallet,
  Factory,
  BarChart3,
  BookOpen,
  Users,
  Settings,
  Crown,
  Palette,
} from 'lucide-react';

export function Sidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/sales/purchases', label: 'Xaridlar', icon: ShoppingBag },
    { href: '/sales', label: 'Sotuvlar', icon: ShoppingCart },
    { href: '/inventory/products', label: 'Tovarlar', icon: PackageCheck },
    { href: '/inventory', label: 'Ombor', icon: Package },
    { href: '/sales/counterparties', label: 'Kontragentlar', icon: UserCheck },
    { href: '/finance', label: 'Moliya', icon: Wallet },
    { href: '/production', label: 'Ishlab chiqarish', icon: Factory },
    { href: '/analytics', label: 'Hisobotlar', icon: BarChart3 },
    { href: '/accounting', label: 'Buxgalteriya', icon: BookOpen },
    { href: '/users', label: 'Foydalanuvchilar', icon: Users },
    { href: '/settings/branches', label: 'Sozlamalar', icon: Settings },
    { href: '/super-admin', label: 'Super-Admin', icon: Crown },
  ];

  return (
    <aside
      style={{
        width: 'var(--sidebar-width)',
        height: '100vh',
        backgroundColor: 'var(--color-bg-sidebar)',
        borderRight: '1px solid var(--color-border-light)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 30,
      }}
    >
      {/* Brand Logo */}
      <div
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: '0 var(--space-6)',
          borderBottom: '1px solid var(--color-border-light)',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary-600)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'var(--font-bold)',
            fontSize: 'var(--text-lg)',
          }}
        >
          C
        </div>
        <div>
          <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-base)', lineHeight: 1.2 }}>
            CRM SaaS
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            MoySklad + 1C
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav style={{ flex: 1, padding: 'var(--space-4) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', overflowY: 'auto' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

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
                color: isActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                backgroundColor: isActive ? 'var(--color-primary-50)' : 'transparent',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              <Icon size={18} style={{ color: isActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer System Status */}
      <div
        style={{
          padding: 'var(--space-4)',
          borderTop: '1px solid var(--color-border-light)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-success-600)',
            }}
          />
          <span>O&apos;zbekiston NAS / BHMS</span>
        </div>
      </div>
    </aside>
  );
}
