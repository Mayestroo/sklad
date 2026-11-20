'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { findNavTrail } from '@/lib/navigation';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Breadcrumbs derived from the navigation (section › page), plus optional
 * extra crumbs for detail pages (e.g. the document number).
 */
export function Breadcrumbs({ extra = [] }: { extra?: Crumb[] }) {
  const t = useTranslations('nav');
  const tUx = useTranslations('ux');
  const pathname = usePathname();
  const { group, leaf } = findNavTrail(pathname);
  const crumbs: Crumb[] = [];
  if (group) crumbs.push({ label: t(group.label), href: group.items[0]?.href });
  if (leaf && (!group || leaf.href !== group.items[0]?.href || extra.length > 0)) {
    crumbs.push({ label: t(leaf.label), href: leaf.href });
  }
  crumbs.push(...extra);
  if (crumbs.length < 2) return null;
  return (
    <nav aria-label={tUx('breadcrumb')}>
      <ol className="app-breadcrumbs" style={{ listStyle: 'none', padding: 0 }}>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {last || !c.href ? (
                <span aria-current={last ? 'page' : undefined}>{c.label}</span>
              ) : (
                <Link href={c.href}>{c.label}</Link>
              )}
              {!last && <ChevronRight size={12} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface PageHeaderProps {
  title: ReactNode;
  /** One line: what the page is for. */
  subtitle?: ReactNode;
  /** Buttons; put the primary action last. */
  actions?: ReactNode;
  /** Extra breadcrumb items after the nav trail (detail pages). */
  crumbs?: Crumb[];
  showBreadcrumbs?: boolean;
}

/** Page title row: breadcrumbs, title + subtitle on the left, actions on the right (wraps on phones). */
export function PageHeader({ title, subtitle, actions, crumbs, showBreadcrumbs = true }: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 'var(--space-5)' }}>
      {showBreadcrumbs && <Breadcrumbs extra={crumbs} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', lineHeight: 'var(--leading-tight)', overflowWrap: 'anywhere' }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{subtitle}</p>
          )}
        </div>
        {actions && <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
      </div>
    </div>
  );
}
