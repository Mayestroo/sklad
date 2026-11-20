import { BadRequestException } from '@nestjs/common';

/** Periods the analytics page offers. No range = all time. */
export const ANALYTICS_RANGES = [
  'today',
  'week',
  'month',
  'quarter',
  'year',
] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Start of the selected period (inclusive), or undefined for all time. */
export function analyticsRangeStart(
  range: string | undefined,
  now: Date = new Date(),
): Date | undefined {
  if (range === undefined || range === '') return undefined;
  if (!(ANALYTICS_RANGES as readonly string[]).includes(range)) {
    throw new BadRequestException(
      `range must be one of: ${ANALYTICS_RANGES.join(', ')}`,
    );
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range as AnalyticsRange) {
    case 'today':
      return start;
    case 'week': {
      const day = (start.getDay() + 6) % 7; // Monday = 0
      start.setDate(start.getDate() - day);
      return start;
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter':
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
  }
}

/**
 * ADR 0023: amounts in different currencies are never added as they are.
 * Analytics converts each document at its own posted rate to UZS; a foreign
 * document without a usable rate is an error, never a rate of 1 (ADR 0022).
 */
export function toUzsRate(
  currency: string,
  exchangeRate: unknown,
  what: string,
): number {
  if (currency === 'UZS') return 1;
  const rate = Number(exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new BadRequestException(
      `${what} has an invalid ${currency} exchange rate`,
    );
  }
  return rate;
}
