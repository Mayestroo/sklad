'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const toggleLanguage = (newLocale: 'uz' | 'ru') => {
    if (newLocale === locale) return;
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--color-bg-tertiary)', padding: '3px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)' }}>
      <Globe size={14} style={{ marginLeft: '8px', color: 'var(--color-text-tertiary)' }} />
      <button
        type="button"
        onClick={() => toggleLanguage('uz')}
        style={{
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          fontSize: 'var(--text-xs)',
          fontWeight: locale === 'uz' ? 'var(--font-semibold)' : 'var(--font-medium)',
          backgroundColor: locale === 'uz' ? 'var(--color-bg-secondary)' : 'transparent',
          color: locale === 'uz' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
          border: 'none',
          boxShadow: locale === 'uz' ? 'var(--shadow-xs)' : 'none',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
      >
        UZ
      </button>
      <button
        type="button"
        onClick={() => toggleLanguage('ru')}
        style={{
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          fontSize: 'var(--text-xs)',
          fontWeight: locale === 'ru' ? 'var(--font-semibold)' : 'var(--font-medium)',
          backgroundColor: locale === 'ru' ? 'var(--color-bg-secondary)' : 'transparent',
          color: locale === 'ru' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
          border: 'none',
          boxShadow: locale === 'ru' ? 'var(--shadow-xs)' : 'none',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
      >
        RU
      </button>
    </div>
  );
}
