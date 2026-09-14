'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { Badge } from '../ui/Badge';
import {
  Bell,
  Search,
  User,
  Settings,
  ShieldCheck,
  CreditCard,
  Building2,
  Shield,
  LogOut,
  ChevronDown,
  ArrowLeftRight,
} from 'lucide-react';

export function Header() {
  const t = useTranslations('common');
  const tAuth = useTranslations('auth');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { user, company, logout, hasRole, isImpersonated, exitImpersonation } = useAuth();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  const getRoleName = (roleSlug?: string) => {
    switch (roleSlug) {
      case 'super_admin':
        return isRu ? 'Суперадминистратор' : 'Super Administrator';
      case 'company_admin':
        return isRu ? 'Главный администратор' : 'Bosh Administrator';
      case 'accountant':
        return isRu ? 'Бухгалтер' : 'Buxgalter';
      case 'cashier':
        return isRu ? 'Кассир' : 'Kassir';
      case 'warehouse_manager':
        return isRu ? 'Менеджер склада' : 'Ombor mudiri';
      case 'salesperson':
        return isRu ? 'Продавец' : 'Sotuvchi';
      case 'viewer':
        return isRu ? 'Только просмотр' : 'Kuzatuvchi';
      default:
        return roleSlug || (isRu ? 'Сотрудник' : 'Xodim');
    }
  };

  const primaryRole = user?.roles?.[0] || 'company_admin';
  const companyName =
    typeof company?.name === 'string'
      ? company.name
      : company?.name?.[locale] || company?.name?.uz || company?.slug || 'Sklad ERP';

  const userInitials =
    user?.firstName && user?.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
      : user?.firstName
        ? user.firstName[0].toUpperCase()
        : 'U';

  return (
    <header
      style={{
        height: 'var(--header-height)',
        backgroundColor: 'var(--color-bg-secondary)',
        borderBottom: '1px solid var(--color-border-light)',
        padding: '0 var(--space-6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Search Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', position: 'relative', width: '320px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--color-text-tertiary)' }} />
        <input
          type="text"
          placeholder={`${t('search')}...`}
          style={{
            width: '100%',
            padding: '8px 12px 8px 36px',
            fontSize: 'var(--text-sm)',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-tertiary)',
            outline: 'none',
            transition: 'border-color var(--transition-fast)',
            color: 'var(--color-text-primary)',
          }}
        />
      </div>

      {/* Right Action Items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {/* Trial Badge */}
        <div
          style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-warning-50)',
            color: 'var(--color-warning-600)',
            border: '1px solid var(--color-warning-100)',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-medium)',
          }}
        >
          {tAuth('trialDays')}
        </div>

        {/* Theme Switcher (Light / Dark) */}
        <ThemeSwitcher />

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Notification Bell */}
        <button
          type="button"
          aria-label="Notifications"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--color-border-light)',
            backgroundColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            transition: 'background-color var(--transition-fast)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Bell size={18} />
        </button>

        {/* Interactive User Profile Menu */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            aria-expanded={isDropdownOpen}
            aria-haspopup="menu"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              background: 'none',
              border: 'none',
              padding: '2px',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              outline: 'none',
              transition: 'opacity var(--transition-fast)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-100)',
                color: 'var(--color-primary-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'var(--font-bold)',
                fontSize: 'var(--text-sm)',
                boxShadow: isDropdownOpen ? '0 0 0 2px var(--color-primary-600)' : 'none',
                transition: 'box-shadow var(--transition-fast)',
              }}
            >
              {user?.firstName ? userInitials : <User size={18} />}
            </div>
            <ChevronDown
              size={14}
              style={{
                color: 'var(--color-text-tertiary)',
                transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform var(--transition-fast)',
              }}
            />
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '280px',
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                padding: 'var(--space-2) 0',
                zIndex: 100,
                animation: 'fadeIn 0.15s ease',
              }}
            >
              {/* User Identity Header */}
              <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--color-primary-100)',
                      color: 'var(--color-primary-700)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'var(--font-bold)',
                      fontSize: 'var(--text-sm)',
                      flexShrink: 0,
                    }}
                  >
                    {user?.firstName ? userInitials : <User size={20} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 'var(--font-bold)',
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Badge variant="info">{getRoleName(primaryRole)}</Badge>
                  {companyName && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: 'var(--color-text-secondary)',
                        backgroundColor: 'var(--color-bg-tertiary)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        border: '1px solid var(--color-border-light)',
                        maxWidth: '160px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <Building2 size={11} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{companyName}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Impersonation Banner if active */}
              {isImpersonated && (
                <div style={{ padding: 'var(--space-2) var(--space-4)', backgroundColor: 'var(--color-warning-50)', borderBottom: '1px solid var(--color-warning-100)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      exitImpersonation();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-warning-600)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 'var(--font-bold)',
                      cursor: 'pointer',
                      padding: '4px 0',
                    }}
                  >
                    <ArrowLeftRight size={14} />
                    <span>{isRu ? 'Выйти из кабинета клиента' : 'Mijoz kabinetidan chiqish'}</span>
                  </button>
                </div>
              )}

              {/* Navigation items */}
              <div style={{ padding: 'var(--space-2) 0' }}>
                {/* Superadmin Console link (if global superadmin) */}
                {hasRole('super_admin') && (
                  <Link
                    href="/admin"
                    onClick={() => setIsDropdownOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: '8px var(--space-4)',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 'var(--font-semibold)',
                      color: 'var(--color-primary-600)',
                      textDecoration: 'none',
                      backgroundColor: 'var(--color-primary-50)',
                      transition: 'background-color var(--transition-fast)',
                    }}
                  >
                    <ShieldCheck size={16} />
                    <span>{isRu ? 'SuperAdmin консоль' : 'SuperAdmin konsoli'}</span>
                  </Link>
                )}

                <Link
                  href="/settings"
                  onClick={() => setIsDropdownOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: '8px var(--space-4)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    textDecoration: 'none',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }}
                >
                  <Settings size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span>{isRu ? 'Настройки профиля' : 'Profil sozlamalari'}</span>
                </Link>

                <Link
                  href="/settings/branches"
                  onClick={() => setIsDropdownOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: '8px var(--space-4)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    textDecoration: 'none',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }}
                >
                  <Building2 size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span>{isRu ? 'Филиалы и склады' : 'Filial va omborlar'}</span>
                </Link>

                <Link
                  href="/settings/security"
                  onClick={() => setIsDropdownOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: '8px var(--space-4)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    textDecoration: 'none',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }}
                >
                  <Shield size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span>{isRu ? 'Безопасность' : 'Xavfsizlik'}</span>
                </Link>

                <Link
                  href="/settings/billing"
                  onClick={() => setIsDropdownOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: '8px var(--space-4)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    textDecoration: 'none',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }}
                >
                  <CreditCard size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span>{isRu ? 'Тариф и оплата' : 'Tarif va to‘lov'}</span>
                </Link>
              </div>

              <div style={{ borderTop: '1px solid var(--color-border-light)', margin: 'var(--space-1) 0' }} />

              {/* Logout button */}
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(false);
                  logout();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  width: '100%',
                  padding: '10px var(--space-4)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-medium)',
                  color: 'var(--color-error-600)',
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background-color var(--transition-fast)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-error-50)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <LogOut size={16} />
                <span>{isRu ? 'Выйти из системы' : 'Tizimdan chiqish'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
