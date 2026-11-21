'use client';

import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

export interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/** What is filtered, as removable chips, one "Tozalash" for all, and the result count when the page knows it. */
export function ActiveFilterChips({ chips, onClearAll, resultCount }: { chips: ActiveChip[]; onClearAll: () => void; resultCount?: number | null }) {
  const t = useTranslations('fb');
  if (chips.length === 0) return null;
  return (
    <div className="fb-active" role="group" aria-label={t('activeFilters')}>
      {chips.map((c) => (
        <span key={c.key} className="fb-chip">
          <span className="fb-chip-text">{c.label}</span>
          <button type="button" onClick={c.onRemove} aria-label={t('removeFilter', { name: c.label })} title={t('removeFilter', { name: c.label })}>
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <button type="button" className="fb-clear" onClick={onClearAll}>
        {t('clearAll')}
      </button>
      {resultCount !== undefined && resultCount !== null && (
        <span className="fb-results" role="status">
          {t('results', { count: resultCount })}
        </span>
      )}
    </div>
  );
}
