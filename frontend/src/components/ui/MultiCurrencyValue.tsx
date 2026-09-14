'use client';

import React from 'react';
import { formatCurrency } from '@/lib/utils';

export interface CurrencyAmountItem {
  currency: string;
  amount: number;
}

interface MultiCurrencyValueProps {
  items?: CurrencyAmountItem[];
  fallbackAmount?: number;
  fallbackCurrency?: string;
  locale: string;
  color?: string;
  className?: string;
}

export function MultiCurrencyValue({
  items,
  fallbackAmount = 0,
  fallbackCurrency = 'UZS',
  locale,
  color,
  className = 'tabular-nums',
}: MultiCurrencyValueProps) {
  const activeItems = (items || []).filter((i) => i.amount > 0);

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
        {formatCurrency(fallbackAmount, locale, fallbackCurrency)}
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
