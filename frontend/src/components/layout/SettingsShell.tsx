'use client';

/**
 * Settings pages share one frame: a searchable list of every settings
 * section (name + one-line explanation) on the left, the chosen section on
 * the right. Finding "where do I change the password / warehouse / tariff"
 * no longer depends on knowing the menu.
 */
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { SearchField, matchesSearch } from '@/components/ui/SearchField';

const SECTIONS = [
  { href: '/settings/branches', key: 'branches' },
  { href: '/settings/sales', key: 'sales' },
  { href: '/settings/production', key: 'production' },
  { href: '/settings/security', key: 'security' },
  { href: '/settings/billing', key: 'billing' },
] as const;

export function SettingsShell({ children }: { children: ReactNode }) {
  const t = useTranslations('rd.settings');
  const pathname = usePathname();
  const [q, setQ] = useState('');
  // Pages outside the five sections (e.g. the design-system gallery) render without the frame.
  const inSection = SECTIONS.some((s) => pathname.startsWith(s.href));
  const shown = SECTIONS.filter((s) => matchesSearch(q, t(`name_${s.key}`), t(`desc_${s.key}`), t(`kw_${s.key}`)));
  if (!inSection) return <>{children}</>;
  return (
    <div className="set-layout">
      <nav className="set-nav" aria-label={t('nav')}>
        <SearchField value={q} onChange={setQ} placeholder={t('searchPh')} label={t('searchPh')} style={{ flex: 'none' }} />
        <ul>
          {shown.map((s) => {
            const active = pathname.startsWith(s.href);
            return (
              <li key={s.href}>
                <Link href={s.href} className="set-item" aria-current={active ? 'page' : undefined}>
                  <span className="set-item-name">{t(`name_${s.key}`)}</span>
                  <span className="set-item-desc">{t(`desc_${s.key}`)}</span>
                </Link>
              </li>
            );
          })}
          {shown.length === 0 && <li className="set-item-desc" style={{ padding: 'var(--space-3)' }}>{t('nothing')}</li>}
        </ul>
      </nav>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
