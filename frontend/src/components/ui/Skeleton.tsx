'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';

/** One shimmering placeholder block (honours reduced motion via globals.css). */
export function Skeleton({ width = '100%', height = 14, radius, style }: { width?: number | string; height?: number | string; radius?: string; style?: CSSProperties }) {
  return <span aria-hidden className="app-skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

/**
 * Loading placeholder shaped like a table / list, so the layout does not jump
 * when the data arrives. Announces "Loading…" to screen readers.
 */
export function SkeletonRows({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  const tUx = useTranslations('ux');
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
      <span className="sr-only">{tUx('loading')}</span>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${Math.max(columns - 1, 1)}, 1fr)`, gap: 'var(--space-4)', alignItems: 'center' }}>
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} height={c === 0 ? 16 : 12} width={c === 0 ? '80%' : '60%'} />
          ))}
        </div>
      ))}
    </div>
  );
}
