'use client';

import { useId } from 'react';
import { Search, X } from 'lucide-react';
import { useLocale } from 'next-intl';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** What can be searched ("Kod yoki nom"). Also the accessible name unless `label` is set. */
  placeholder: string;
  /** Accessible name when it should differ from the placeholder. */
  label?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
}

/** List search box: magnifier, clear button, Esc clears. */
export function SearchField({ value, onChange, placeholder, label, style, autoFocus }: SearchFieldProps) {
  const id = useId();
  const isRu = useLocale() === 'ru';
  return (
    <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0, ...style }}>
      <Search
        size={16}
        aria-hidden
        style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}
      />
      <input
        id={id}
        type="search"
        className="ux-search-input"
        value={value}
        autoFocus={autoFocus}
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
        style={{
          width: '100%',
          height: 38,
          boxSizing: 'border-box',
          padding: '0 36px 0 36px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-input)',
          color: 'var(--color-text-primary)',
          fontSize: 'var(--text-sm)',
          outline: 'none',
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={isRu ? 'Очистить поиск' : 'Qidiruvni tozalash'}
          title={isRu ? 'Очистить поиск' : 'Qidiruvni tozalash'}
          style={{
            position: 'absolute',
            right: 3,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer',
          }}
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Lower-case, trimmed match helper for client-side list search. */
export function matchesSearch(query: string, ...fields: Array<string | number | null | undefined>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f !== null && f !== undefined && String(f).toLowerCase().includes(q));
}
