'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
  ClipboardList,
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
  Receipt,
  RotateCcw,
  Truck,
  ChevronDown,
  ChevronRight,
  GitBranch,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';

export function Sidebar() {
  const t = useTranslations('nav');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const pathname = usePathname();
  const { company } = useAuth();

  const isPurchasesActive = pathname.startsWith('/purchases');
  const [isPurchasesOpen, setIsPurchasesOpen] = useState(isPurchasesActive);

  const isSalesActive = pathname.startsWith('/sales');
  const [isSalesOpen, setIsSalesOpen] = useState(isSalesActive);

  const isSettingsActive = pathname.startsWith('/settings');
  const [isSettingsOpen, setIsSettingsOpen] = useState(isSettingsActive);

  useEffect(() => {
    if (isPurchasesActive) {
      setIsPurchasesOpen(true);
    }
  }, [isPurchasesActive]);

  useEffect(() => {
    if (isSalesActive) {
      setIsSalesOpen(true);
    }
  }, [isSalesActive]);

  useEffect(() => {
    if (isSettingsActive) {
      setIsSettingsOpen(true);
    }
  }, [isSettingsActive]);

  const purchasesSubItems = [
    { href: '/purchases', label: t('purchases'), icon: ShoppingBag },
    { href: '/purchases/expenses', label: t('purchasesExpenses'), icon: Receipt },
    { href: '/purchases/returns', label: t('purchasesReturns'), icon: RotateCcw },
    { href: '/purchases/suppliers', label: t('suppliers'), icon: UserCheck },
  ];

  const enableMultiTierPriceLists = Boolean(
    company?.settings?.sales?.enableMultiTierPriceLists,
  );

  const salesSubItems = [
    { href: '/sales/orders', label: t('salesOrders'), icon: ClipboardList },
    { href: '/sales', label: t('salesOverview'), icon: ShoppingCart },
    { href: '/sales/returns', label: t('salesReturns'), icon: RotateCcw },
    { href: '/sales/customers', label: t('customers'), icon: UserCheck },
    ...(enableMultiTierPriceLists
      ? [{ href: '/sales/prices', label: t('prices'), icon: Receipt }]
      : []),
  ];

  const settingsSubItems = [
    { href: '/settings/branches', label: isRu ? 'Филиалы и склады' : 'Filial va omborlar', icon: GitBranch },
    { href: '/settings/sales', label: isRu ? 'Настройки продаж' : 'Savdo sozlamalari', icon: ShoppingCart },
    { href: '/settings/security', label: isRu ? 'Безопасность' : 'Xavfsizlik', icon: ShieldCheck },
    { href: '/settings/billing', label: isRu ? 'Тариф и оплата' : 'Tarif va to\'lov', icon: CreditCard },
  ];

  const bottomNavItems = [
    { href: '/counterparties', label: t('counterparties'), icon: Users },
    { href: '/products', label: t('products'), icon: PackageCheck },
    { href: '/inventory', label: t('inventory'), icon: Package },
    { href: '/finance', label: t('finance'), icon: Wallet },
    { href: '/production', label: t('production'), icon: Factory },
    { href: '/analytics', label: t('analytics'), icon: BarChart3 },
    { href: '/accounting', label: t('accounting'), icon: BookOpen },
    { href: '/users', label: t('users'), icon: Users },
    { href: '/super-admin', label: t('superAdmin'), icon: Crown },
  ];

  const itemBaseStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--leading-normal)',
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
  };

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
            fontFamily: 'var(--font-sans)',
          }}
        >
          C
        </div>
        <div>
          <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-base)', lineHeight: 1.2, fontFamily: 'var(--font-sans)' }}>
            CRM SaaS
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
            MoySklad + 1C
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav style={{ flex: 1, padding: 'var(--space-4) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', overflowY: 'auto' }}>
        {/* Dashboard */}
        <Link
          href="/"
          style={{
            ...itemBaseStyle,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: '10px 14px',
            fontWeight: pathname === '/' ? 'var(--font-semibold)' : 'var(--font-medium)',
            color: pathname === '/' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
            backgroundColor: pathname === '/' ? 'var(--color-primary-50)' : 'transparent',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => {
            if (pathname !== '/') e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
          }}
          onMouseLeave={(e) => {
            if (pathname !== '/') e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <LayoutDashboard size={18} style={{ color: pathname === '/' ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
          <span>{t('dashboard')}</span>
        </Link>

        {/* Purchases Dropdown Group */}
        <div>
          <button
            type="button"
            onClick={() => setIsPurchasesOpen((prev) => !prev)}
            style={{
              ...itemBaseStyle,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              fontWeight: isPurchasesActive ? 'var(--font-semibold)' : 'var(--font-medium)',
              color: isPurchasesActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
              backgroundColor: isPurchasesActive && !isPurchasesOpen ? 'var(--color-primary-50)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <ShoppingBag size={18} style={{ color: isPurchasesActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
              <span>{t('purchases')}</span>
            </div>
            {isPurchasesOpen ? (
              <ChevronDown size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            ) : (
              <ChevronRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            )}
          </button>

          {/* Purchases Sub-items */}
          {isPurchasesOpen && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                marginTop: '2px',
                marginLeft: '12px',
                paddingLeft: '12px',
                borderLeft: '2px solid var(--color-border-light)',
              }}
            >
              {purchasesSubItems.map((sub) => {
                const SubIcon = sub.icon;
                const isSubActive =
                  sub.href === '/purchases'
                    ? pathname === '/purchases'
                    : pathname === sub.href || pathname.startsWith(`${sub.href}/`);

                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    style={{
                      ...itemBaseStyle,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: '8px 12px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: isSubActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                      color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                      backgroundColor: isSubActive ? 'var(--color-primary-50)' : 'transparent',
                      textDecoration: 'none',
                    }}
                  >
                    <SubIcon size={15} style={{ color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
                    <span>{sub.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Sales Dropdown Group */}
        <div>
          <button
            type="button"
            onClick={() => setIsSalesOpen((prev) => !prev)}
            style={{
              ...itemBaseStyle,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              fontWeight: isSalesActive ? 'var(--font-semibold)' : 'var(--font-medium)',
              color: isSalesActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
              backgroundColor: isSalesActive && !isSalesOpen ? 'var(--color-primary-50)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <ShoppingCart size={18} style={{ color: isSalesActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
              <span>{t('sales')}</span>
            </div>
            {isSalesOpen ? (
              <ChevronDown size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            ) : (
              <ChevronRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            )}
          </button>

          {/* Sales Sub-items */}
          {isSalesOpen && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                marginTop: '2px',
                marginLeft: '12px',
                paddingLeft: '12px',
                borderLeft: '2px solid var(--color-border-light)',
              }}
            >
              {salesSubItems.map((sub) => {
                const SubIcon = sub.icon;
                const isSubActive =
                  sub.href === '/sales'
                    ? pathname === '/sales'
                    : pathname === sub.href || pathname.startsWith(`${sub.href}/`);

                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    style={{
                      ...itemBaseStyle,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: '8px 12px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: isSubActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                      color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                      backgroundColor: isSubActive ? 'var(--color-primary-50)' : 'transparent',
                      textDecoration: 'none',
                    }}
                  >
                    <SubIcon size={15} style={{ color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
                    <span>{sub.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Settings Dropdown Group */}
        <div>
          <button
            type="button"
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            style={{
              ...itemBaseStyle,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              fontWeight: isSettingsActive ? 'var(--font-semibold)' : 'var(--font-medium)',
              color: isSettingsActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
              backgroundColor: isSettingsActive && !isSettingsOpen ? 'var(--color-primary-50)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Settings size={18} style={{ color: isSettingsActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
              <span>{t('settings')}</span>
            </div>
            {isSettingsOpen ? (
              <ChevronDown size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            ) : (
              <ChevronRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            )}
          </button>

          {/* Settings Sub-items */}
          {isSettingsOpen && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                marginTop: '2px',
                marginLeft: '12px',
                paddingLeft: '12px',
                borderLeft: '2px solid var(--color-border-light)',
              }}
            >
              {settingsSubItems.map((sub) => {
                const SubIcon = sub.icon;
                const isSubActive =
                  pathname === sub.href || pathname.startsWith(`${sub.href}/`);

                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    style={{
                      ...itemBaseStyle,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: '8px 12px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: isSubActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                      color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                      backgroundColor: isSubActive ? 'var(--color-primary-50)' : 'transparent',
                      textDecoration: 'none',
                    }}
                  >
                    <SubIcon size={15} style={{ color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
                    <span>{sub.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom items */}
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                ...itemBaseStyle,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: '10px 14px',
                fontWeight: isActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                color: isActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                backgroundColor: isActive ? 'var(--color-primary-50)' : 'transparent',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
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
          fontFamily: 'var(--font-sans)',
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
