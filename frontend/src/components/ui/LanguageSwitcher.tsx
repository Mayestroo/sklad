'use client';

import { useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Globe, Loader2 } from 'lucide-react';

export function LanguageSwitcher() {
  const locale = useLocale() as 'uz' | 'ru';
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [optimisticLocale, setOptimisticLocale] = useState<'uz' | 'ru' | null>(null);

  const activeLocale = optimisticLocale || locale;

  const toggleLanguage = (newLocale: 'uz' | 'ru') => {
    if (newLocale === activeLocale) return;

    // 1. Instant 0ms optimistic UI update
    setOptimisticLocale(newLocale);

    // 2. Set cookie for next-intl server negotiation
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;

    // 3. Perform concurrent React transition
    startTransition(() => {
      router.replace(pathname, { locale: newLocale });
      router.refresh();
    });
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
        position: 'relative',
      }}
    >
      <div style={{ marginLeft: '8px', display: 'flex', alignItems: 'center', color: 'var(--color-text-tertiary)' }}>
        {isPending ? (
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-primary-600)' }} />
        ) : (
          <Globe size={14} />
        )}
      </div>

      <button
        type="button"
        disabled={isPending && activeLocale === 'uz'}
        onClick={() => toggleLanguage('uz')}
        aria-label="O‘zbek tili"
        style={{
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          fontSize: 'var(--text-xs)',
          fontWeight: activeLocale === 'uz' ? 'var(--font-semibold)' : 'var(--font-medium)',
          backgroundColor: activeLocale === 'uz' ? 'var(--color-bg-secondary)' : 'transparent',
          color: activeLocale === 'uz' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
          border: 'none',
          boxShadow: activeLocale === 'uz' ? 'var(--shadow-xs)' : 'none',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
      >
        UZ
      </button>

      <button
        type="button"
        disabled={isPending && activeLocale === 'ru'}
        onClick={() => toggleLanguage('ru')}
        aria-label="Русский язык"
        style={{
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          fontSize: 'var(--text-xs)',
          fontWeight: activeLocale === 'ru' ? 'var(--font-semibold)' : 'var(--font-medium)',
          backgroundColor: activeLocale === 'ru' ? 'var(--color-bg-secondary)' : 'transparent',
          color: activeLocale === 'ru' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
          border: 'none',
          boxShadow: activeLocale === 'ru' ? 'var(--shadow-xs)' : 'none',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
      >
        RU
      </button>
    </div>
  );
}
