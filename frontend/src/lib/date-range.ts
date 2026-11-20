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
