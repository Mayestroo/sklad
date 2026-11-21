/**
 * Dates as users type and read them: dd.MM.yyyy (TZ "Ishlab chiqarish"
 * 11.5), stored as ISO 'YYYY-MM-DD'. Never mm/dd/yyyy.
 */

/** 'YYYY-MM-DD' → 'dd.MM.yyyy' ('' stays ''). */
export function formatDmy(iso: string | null | undefined): string {
  if (!iso) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return '';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

/** 'dd.MM.yyyy' (also d.M.yyyy, '/' or '-' separators) → 'YYYY-MM-DD', or null when not a real date. */
export function parseDmy(text: string): string | null {
  const match = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(text);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Typing help: digits only, dots added after the day and month ("20112026" → "20.11.2026"). */
export function maskDmy(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

/** "20.11.2026 – 25.11.2026", one side, or '' for an empty range. */
export function formatRange(from: string, to: string): string {
  if (from && to) return `${formatDmy(from)} – ${formatDmy(to)}`;
  if (from) return `${formatDmy(from)} –`;
  if (to) return `– ${formatDmy(to)}`;
  return '';
}

/** The range in order: a "to" before "from" is swapped, never refused. */
export function orderedRange(from: string, to: string): [string, string] {
  return from && to && to < from ? [to, from] : [from, to];
}

/** The user's local calendar date as 'YYYY-MM-DD' (never UTC: after midnight in Tashkent, UTC is still "yesterday"). */
export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type QuickPeriod =
  | 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom';

/**
 * Local-date range of a quick period. Weeks start on Monday (Uzbekistan and
 * Russia), the range ends today for "this …" periods.
 */
export function quickPeriodRange(period: QuickPeriod, now: Date = new Date()): { date_from: string; date_to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = localIsoDate(now);
  const day = (offset: number) => localIsoDate(new Date(y, m, now.getDate() + offset));
  const mondayOffset = -((now.getDay() + 6) % 7);
  switch (period) {
    case 'today':
      return { date_from: today, date_to: today };
    case 'yesterday':
      return { date_from: day(-1), date_to: day(-1) };
    case 'this_week':
      return { date_from: day(mondayOffset), date_to: today };
    case 'last_week':
      return { date_from: day(mondayOffset - 7), date_to: day(mondayOffset - 1) };
    case 'last_month':
      return { date_from: localIsoDate(new Date(y, m - 1, 1)), date_to: localIsoDate(new Date(y, m, 0)) };
    case 'this_quarter':
      return { date_from: localIsoDate(new Date(y, Math.floor(m / 3) * 3, 1)), date_to: today };
    case 'this_year':
      return { date_from: `${y}-01-01`, date_to: today };
    case 'this_month':
    default:
      return { date_from: localIsoDate(new Date(y, m, 1)), date_to: today };
  }
}
