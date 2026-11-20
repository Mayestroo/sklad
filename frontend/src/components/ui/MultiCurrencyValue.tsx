'use client';

import { formatCurrency } from '@/lib/utils';

export interface CurrencyAmountItem {
  currency: string;
  amount: number;
}

interface MultiCurrencyValueProps {
  items?: CurrencyAmountItem[];
  locale: string;
  color?: string;
  className?: string;
}

/**
 * One line per currency, never summed across currencies (ADR 0023). With no
 * non-zero amount it shows a plain 0: a zero has no currency to guess
 * (ADR 0022).
 */
export function MultiCurrencyValue({
  items,
  locale,
  color,
  className = 'tabular-nums',
}: MultiCurrencyValueProps) {
  const activeItems = (items || []).filter((i) => i.amount !== 0);

  if (activeItems.length === 0) {
    return (
      <div
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--font-bold)',
          color: color || 'var(--color-text-primary)',
          marginTop: '2px',
        }}
        className={className}
      >
        0
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
      {activeItems.map((item, idx) => (
        <div
          key={item.currency}
          style={{
            fontSize: idx === 0 ? 'var(--text-xl)' : 'var(--text-base)',
            fontWeight: 'var(--font-bold)',
            color: color || 'var(--color-text-primary)',
            lineHeight: 1.25,
          }}
          className={className}
        >
          {formatCurrency(item.amount, locale, item.currency)}
        </div>
      ))}
    </div>
  );
}
