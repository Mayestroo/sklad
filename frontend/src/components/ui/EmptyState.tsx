'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  /** What is missing ("No sales yet"). */
  title: string;
  /** What to do next ("Create the first sale — stock and debts update automatically"). */
  description?: string;
  icon?: LucideIcon;
  /** The next step, usually a primary Button or Link. */
  action?: ReactNode;
  /** Smaller variant for cards and table bodies. */
  compact?: boolean;
}

/** Empty list / no results: says what is missing and offers the next step. */
export function EmptyState({ title, description, icon: Icon = Inbox, action, compact = false }: EmptyStateProps) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 'var(--space-2)',
        padding: compact ? 'var(--space-6) var(--space-4)' : 'var(--space-12) var(--space-6)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: compact ? 40 : 56,
          height: compact ? 40 : 56,
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-1)',
        }}
      >
        <Icon size={compact ? 20 : 26} />
      </div>
      <div style={{ fontSize: compact ? 'var(--text-sm)' : 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
        {title}
      </div>
      {description && (
        <p style={{ maxWidth: 420, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)' }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 'var(--space-2)' }}>{action}</div>}
    </div>
  );
}
