'use client';

import { useLocale } from 'next-intl';
import { Badge } from '@/components/ui/Badge';

const LABELS: Record<string, { uz: string; ru: string; variant: 'info' | 'warning' | 'neutral' | 'success' | 'error' }> = {
  ASSET: { uz: 'Aktiv', ru: 'Актив', variant: 'info' },
  LIABILITY: { uz: 'Majburiyat', ru: 'Обязательство', variant: 'warning' },
  EQUITY: { uz: 'Kapital', ru: 'Капитал', variant: 'neutral' },
  REVENUE: { uz: 'Daromad', ru: 'Доход', variant: 'success' },
  EXPENSE: { uz: 'Xarajat', ru: 'Расход', variant: 'error' },
};

export const ACCOUNT_TYPES = Object.keys(LABELS);

export function accountTypeLabel(type: string, locale: string): string {
  const l = LABELS[type];
  if (!l) return type;
  return locale === 'ru' ? l.ru : l.uz;
}

/** Account type in words (no raw ASSET/LIABILITY codes). */
export function AccountTypeBadge({ type }: { type: string }) {
  const locale = useLocale();
  return <Badge variant={LABELS[type]?.variant ?? 'neutral'}>{accountTypeLabel(type, locale)}</Badge>;
}
