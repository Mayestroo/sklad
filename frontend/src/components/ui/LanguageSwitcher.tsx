'use client';

import { useLocale } from 'next-intl';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const locale = useLocale() as 'uz' | 'ru';

  const toggleLanguage = (newLocale: 'uz' | 'ru') => {
    if (newLocale === locale) return;
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: 'var(--color-bg-tertiary)',
        padding: '3px',
        borderRadius: 'var(--radius-full)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div style={{ marginLeft: '8px', display: 'flex', alignItems: 'center', color: 'var(--color-text-tertiary)' }}>
        <Globe size={14} />
      </div>

      <button
        type="button"
        onClick={() => toggleLanguage('uz')}
        aria-label="O‘zbek tili"
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
        aria-label="Русский язык"
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
