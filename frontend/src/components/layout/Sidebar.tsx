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
  Receipt,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  GitBranch,
  ShieldCheck,
  CreditCard,
  Briefcase,
  Scale,
  Building2,
} from 'lucide-react';

export function Sidebar() {
  const t = useTranslations('nav');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const pathname = usePathname();
  const { company } = useAuth();

  // Dropdown states
  const isPurchasesActive = pathname.startsWith('/purchases');
  const [isPurchasesOpen, setIsPurchasesOpen] = useState(isPurchasesActive);

  const isSalesActive = pathname.startsWith('/sales');
  const [isSalesOpen, setIsSalesOpen] = useState(isSalesActive);

  const isSettingsActive = pathname.startsWith('/settings');
  const [isSettingsOpen, setIsSettingsOpen] = useState(isSettingsActive);

  useEffect(() => {
    if (isPurchasesActive) setIsPurchasesOpen(true);
  }, [isPurchasesActive]);

  useEffect(() => {
    if (isSalesActive) setIsSalesOpen(true);
  }, [isSalesActive]);

  useEffect(() => {
    if (isSettingsActive) setIsSettingsOpen(true);
  }, [isSettingsActive]);

  // Sub-items for Purchases
  const purchasesSubItems = [
    { href: '/purchases', label: t('purchases'), icon: ShoppingBag },
    { href: '/purchases/expenses', label: t('purchasesExpenses'), icon: Receipt },
    { href: '/purchases/returns', label: t('purchasesReturns'), icon: RotateCcw },
    { href: '/purchases/suppliers', label: t('suppliers'), icon: UserCheck },
  ];

  // Sub-items for Sales
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

  // Sub-items for Settings
  const settingsSubItems = [
    { href: '/settings/branches', label: isRu ? 'Филиалы и склады' : 'Filial va omborlar', icon: GitBranch },
    { href: '/settings/sales', label: isRu ? 'Настройки продаж' : 'Savdo sozlamalari', icon: ShoppingCart },
    { href: '/settings/security', label: isRu ? 'Безопасность' : 'Xavfsizlik', icon: ShieldCheck },
    { href: '/settings/billing', label: isRu ? 'Тариф и оплата' : 'Tarif va to‘lov', icon: CreditCard },
  ];

  const itemBaseStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--leading-normal)',
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
  };

  const renderNavLink = (href: string, label: string, Icon: any, exact = false) => {
    const isActive = exact ? pathname === href : pathname === href || (href !== '/' && pathname.startsWith(href));

    return (
      <Link
        key={href}
        href={href}
        style={{
          ...itemBaseStyle,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: '9px 14px',
          fontWeight: isActive ? 'var(--font-semibold)' : 'var(--font-medium)',
          color: isActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
          backgroundColor: isActive ? 'var(--color-primary-50)' : 'transparent',
          textDecoration: 'none',
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
          {label}
        </span>
      </Link>
    );
  };

  const renderSectionHeader = (title: string) => (
    <div
      style={{
        padding: '14px 14px 4px 14px',
        fontSize: '11px',
        fontWeight: 'var(--font-bold)',
        color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        userSelect: 'none',
      }}
    >
      {title}
    </div>
  );

  const companyDisplayName =
    typeof company?.name === 'string'
      ? company.name
      : company?.name?.[locale] || company?.name?.uz || company?.slug || 'Sklad ERP';

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
      {/* Brand Header */}
      <div
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: '0 var(--space-5)',
          borderBottom: '1px solid var(--color-border-light)',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary-600)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'var(--font-bold)',
            fontSize: 'var(--text-base)',
            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
            flexShrink: 0,
          }}
        >
          <Package size={20} />
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div
            style={{
              fontWeight: 'var(--font-bold)',
              fontSize: 'var(--text-base)',
              color: 'var(--color-text-primary)',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {companyDisplayName}
          </div>
        </div>
      </div>

      {/* Navigation List organized into logical ERP sections */}
      <nav
        style={{
          flex: 1,
          padding: 'var(--space-3) var(--space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          overflowY: 'auto',
        }}
      >
        {/* ─── 1. ASOSIY / MAIN ───────────────────────── */}
        {renderSectionHeader(isRu ? 'Основное' : 'Asosiy')}
        {renderNavLink('/', t('dashboard'), LayoutDashboard, true)}
        {renderNavLink('/analytics', t('analytics'), BarChart3)}

        {/* ─── 2. SAVDO VA XARID / COMMERCIAL ──────────── */}
        {renderSectionHeader(isRu ? 'Торговля и Закупки' : 'Savdo va Xarid')}

        {/* Sales Dropdown */}
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
              padding: '9px 14px',
              fontWeight: isSalesActive ? 'var(--font-semibold)' : 'var(--font-medium)',
              color: isSalesActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
              backgroundColor: isSalesActive && !isSalesOpen ? 'var(--color-primary-50)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              if (!isSalesActive || isSalesOpen) {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSalesActive || isSalesOpen) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <ShoppingCart size={18} style={{ color: isSalesActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
              <span>{t('sales')}</span>
            </div>
            {isSalesOpen ? (
              <ChevronDown size={15} style={{ color: 'var(--color-text-tertiary)' }} />
            ) : (
              <ChevronRight size={15} style={{ color: 'var(--color-text-tertiary)' }} />
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
                marginLeft: '14px',
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
                      padding: '7px 10px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: isSubActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                      color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                      backgroundColor: isSubActive ? 'var(--color-primary-50)' : 'transparent',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSubActive) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSubActive) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <SubIcon size={14} style={{ color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
                    <span>{sub.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Purchases Dropdown */}
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
              padding: '9px 14px',
              fontWeight: isPurchasesActive ? 'var(--font-semibold)' : 'var(--font-medium)',
              color: isPurchasesActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
              backgroundColor: isPurchasesActive && !isPurchasesOpen ? 'var(--color-primary-50)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              if (!isPurchasesActive || isPurchasesOpen) {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isPurchasesActive || isPurchasesOpen) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <ShoppingBag size={18} style={{ color: isPurchasesActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
              <span>{t('purchases')}</span>
            </div>
            {isPurchasesOpen ? (
              <ChevronDown size={15} style={{ color: 'var(--color-text-tertiary)' }} />
            ) : (
              <ChevronRight size={15} style={{ color: 'var(--color-text-tertiary)' }} />
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
                marginLeft: '14px',
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
                      padding: '7px 10px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: isSubActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                      color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                      backgroundColor: isSubActive ? 'var(--color-primary-50)' : 'transparent',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSubActive) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSubActive) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <SubIcon size={14} style={{ color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
                    <span>{sub.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Counterparties */}
        {renderNavLink('/counterparties', t('counterparties'), Users)}

        {/* ─── 3. OMBOR VA MAHSULOTLAR / INVENTORY ─────── */}
        {renderSectionHeader(isRu ? 'Склад и Товары' : 'Ombor va Mahsulotlar')}
        {renderNavLink('/products', t('products'), PackageCheck)}
        {renderNavLink('/services', t('services'), Briefcase)}
        {renderNavLink('/inventory', t('inventory'), Package)}
        {renderNavLink('/production', t('production'), Factory)}

        {/* ─── 4. MOLIYA VA BUXGALTERIYA / FINANCE ─────── */}
        {renderSectionHeader(isRu ? 'Финансы и Бухгалтерия' : 'Moliya va Buxgalteriya')}
        {renderNavLink('/finance', t('finance'), Wallet)}
        {renderNavLink('/accounting', t('accounting'), BookOpen)}
        {renderNavLink(
          '/opening-balances',
          isRu ? 'Начальные остатки' : 'Boshlang‘ich qoldiqlar',
          Scale,
        )}

        {/* ─── 5. BOSHQARUV VA SOZLAMALAR / SETTINGS ───── */}
        {renderSectionHeader(isRu ? 'Управление и Настройки' : 'Boshqaruv va Sozlamalar')}
        {renderNavLink('/users', t('users'), UserCheck)}

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
              padding: '9px 14px',
              fontWeight: isSettingsActive ? 'var(--font-semibold)' : 'var(--font-medium)',
              color: isSettingsActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
              backgroundColor: isSettingsActive && !isSettingsOpen ? 'var(--color-primary-50)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              if (!isSettingsActive || isSettingsOpen) {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSettingsActive || isSettingsOpen) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Settings size={18} style={{ color: isSettingsActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
              <span>{t('settings')}</span>
            </div>
            {isSettingsOpen ? (
              <ChevronDown size={15} style={{ color: 'var(--color-text-tertiary)' }} />
            ) : (
              <ChevronRight size={15} style={{ color: 'var(--color-text-tertiary)' }} />
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
                marginLeft: '14px',
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
                      padding: '7px 10px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: isSubActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                      color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                      backgroundColor: isSubActive ? 'var(--color-primary-50)' : 'transparent',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSubActive) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSubActive) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <SubIcon size={14} style={{ color: isSubActive ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)' }} />
                    <span>{sub.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
