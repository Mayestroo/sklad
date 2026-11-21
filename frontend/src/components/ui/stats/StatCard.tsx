'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

export interface StatTrend {
  /** Ready text ("+12% oyga nisbatan"). */
  text: string;
  direction: 'up' | 'down' | 'flat';
  /** Which direction is good for this number (sales: up; costs: down). Colour follows it. */
  good?: 'up' | 'down';
}

export interface StatCardProps {
  label: string;
  /** Formatted value (formatCurrency / MultiCurrencyValue / a number). null/undefined shows "—". */
  value: ReactNode;
  /** Plain information under the value ("2 ta mijoz", "Marja: 16,0%"). */
  secondary?: ReactNode;
  trend?: StatTrend;
  /** The value is below zero / a shortfall: the one case where the value is coloured. */
  negative?: boolean;
  loading?: boolean;
}

/** Shared colour rule: semantic colour only for a negative value or a trend text, never for the frame. */
export function trendTone(t: StatTrend): 'positive' | 'negative' | 'neutral' {
  if (t.direction === 'flat' || !t.good) return 'neutral';
  return t.direction === t.good ? 'positive' : 'negative';
}

/**
 * One key number: label · value · optional secondary line · optional trend.
 * Not a button, link or filter — the list's filters live in the FilterBar.
 * Every card in the app has this frame (no accent borders or stripes).
 */
export function StatCard({ label, value, secondary, trend, negative, loading }: StatCardProps) {
  const tUx = useTranslations('ux');
  const empty = value === null || value === undefined || value === '';
  const Icon = trend?.direction === 'up' ? ArrowUpRight : trend?.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <div className="stat-card" aria-busy={loading || undefined}>
      <span className="stat-label">{label}</span>
      {loading ? (
        <>
          <span className="sr-only">{tUx('loading')}</span>
          <Skeleton height={24} width="70%" />
          {secondary !== undefined && <Skeleton height={12} width="45%" />}
        </>
      ) : (
        <>
          <span className="stat-value" data-negative={negative || undefined}>
            {empty ? '—' : value}
          </span>
          {secondary !== undefined && secondary !== null && secondary !== '' && <span className="stat-secondary">{secondary}</span>}
          {trend && (
            <span className="stat-trend" data-tone={trendTone(trend)}>
              <Icon size={14} aria-hidden />
              {trend.text}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Grid of StatCards: 4 columns on desktop (fewer when there are fewer cards), 2 on tablets and phones, 1 on very narrow screens. */
export function StatCardGrid({ label, children, count }: { label: string; children: ReactNode; count?: number }) {
  return (
    <section className="stat-grid" aria-label={label} style={count ? ({ ['--stat-cols' as string]: Math.min(4, Math.max(1, count)) } as React.CSSProperties) : undefined}>
      {children}
    </section>
  );
}
