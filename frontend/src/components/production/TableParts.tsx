'use client';

import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Locale } from './types';

/** Header cell: small, secondary colour, its own background (TZ 11.1, 11.2). */
export const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  background: 'var(--color-bg-tertiary)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--color-border-light)',
};

/** Data cell: at least 12 px padding, rows at least 56 px high. */
export const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  height: 56,
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-primary)',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--color-border-light)',
};

/** The actions column stays visible at the right edge (sticky). */
export const stickyRight: React.CSSProperties = {
  position: 'sticky',
  right: 0,
  background: 'var(--color-bg-secondary)',
  boxShadow: '-8px 0 8px -8px rgba(0,0,0,0.15)',
};

export type SortDir = 'asc' | 'desc';

export function SortHeader<K extends string>({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  align = 'left',
  style,
}: {
  label: string;
  field: K;
  sortBy: K;
  sortDir: SortDir;
  onSort: (field: K) => void;
  align?: 'left' | 'right';
  style?: React.CSSProperties;
}) {
  const active = sortBy === field;
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...thStyle, textAlign: align, ...style }}>
      <button
        type="button"
        onClick={() => onSort(field)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, border: 'none', background: 'none', padding: 0, font: 'inherit', color: active ? 'var(--color-text-primary)' : 'inherit', cursor: 'pointer', flexDirection: align === 'right' ? 'row-reverse' : 'row' }}
      >
        {label}
        <Icon size={12} aria-hidden style={{ opacity: active ? 1 : 0.5 }} />
      </button>
    </th>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  /** Kept for callers; texts come from the messages. */
  locale?: Locale;
}) {
  const t = useTranslations('production');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const navButton: React.CSSProperties = { width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', cursor: 'pointer' };
  return (
    <nav aria-label={t('sahifalar')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
        {first}–{last} / {total}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" aria-label={t('oldingiSahifa')} title={t('oldingiSahifa')} disabled={page <= 1} onClick={() => onPage(page - 1)} style={{ ...navButton, opacity: page <= 1 ? 0.4 : 1 }}>
          <ChevronLeft size={16} aria-hidden />
        </button>
        <span style={{ fontSize: 'var(--text-sm)' }} aria-live="polite">
          {page} / {pages}
        </span>
        <button type="button" aria-label={t('keyingiSahifa')} title={t('keyingiSahifa')} disabled={page >= pages} onClick={() => onPage(page + 1)} style={{ ...navButton, opacity: page >= pages ? 0.4 : 1 }}>
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </nav>
  );
}

export function SkeletonRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden>
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} style={tdStyle}>
              <span className="prod-skeleton" style={{ width: c === 0 ? '70%' : '50%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function EmptyState({ icon, text, hint, action }: { icon: React.ReactNode; text: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
      <div aria-hidden style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
        {icon}
      </div>
      <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{text}</div>
      {hint && <p style={{ maxWidth: 440, fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>{hint}</p>}
      {action}
    </div>
  );
}
