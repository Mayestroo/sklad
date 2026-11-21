'use client';

/**
 * Pieces of a row-preview drawer: the list row opens a side drawer with the
 * document's head (status, amount), key facts, lines and next actions, so the
 * user checks a document without leaving the list.
 */
import type { ReactNode } from 'react';

export function PreviewHead({ badges, amount, caption }: { badges?: ReactNode; amount?: ReactNode; caption?: ReactNode }) {
  return (
    <div className="rd-preview-head">
      {badges && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{badges}</div>}
      {amount !== undefined && <div className="rd-preview-amount">{amount}</div>}
      {caption && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{caption}</div>}
    </div>
  );
}

export interface Fact {
  label: string;
  value: ReactNode;
  hidden?: boolean;
}

export function Facts({ items }: { items: Fact[] }) {
  return (
    <dl className="rd-facts">
      {items
        .filter((f) => !f.hidden)
        .map((f) => (
          <div key={f.label} className="rd-fact">
            <dt>{f.label}</dt>
            <dd>{f.value ?? '—'}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Paid share of a document (0..1), with an accessible label. */
export function PaidProgress({ paid, total, label }: { paid: number; total: number; label: string }) {
  const share = total > 0 ? Math.min(1, Math.max(0, paid / total)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} className="rd-progress">
      <span style={{ width: `${share * 100}%` }} />
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="rd-section-title">{children}</h3>;
}
