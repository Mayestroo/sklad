'use client';

import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { Bell, Search, User } from 'lucide-react';

export function Header() {
  const t = useTranslations('common');
  const tAuth = useTranslations('auth');

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
          ⚡ {tAuth('trialDays')}
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
          }}
        >
          <Bell size={18} />
        </button>

        {/* User Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
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
            }}
          >
            <User size={18} />
          </div>
        </div>
      </div>
    </header>
  );
}
