/**
 * List filters as plain strings (FilterBar, ADR-free UX layer): one flat
 * `Record<string, string>` per page, so the URL, the remembered view and the
 * phone sheet's draft are the same shape. A page turns these values into the
 * API query it already sent before — this module never decides API parameters.
 */
import { formatDmy, localIsoDate, quickPeriodRange } from './date-range.ts';

export type FilterValues = Record<string, string>;

/** Period presets in the order the picker shows them; '' is "all time". */
export const PERIOD_PRESETS = ['today', 'yesterday', 'this_week', 'this_month', 'last_month', 'this_year', ''] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

const CUSTOM = /^(\d{4}-\d{2}-\d{2})?_(\d{4}-\d{2}-\d{2})?$/;

/** A custom range as one value: "2026-11-01_2026-11-21" (either end may be empty). */
export function customPeriod(from: string, to: string): string {
  if (!from && !to) return '';
  const [a, b] = from && to && to < from ? [to, from] : [from, to];
  return `${a}_${b}`;
}

/** Whether the value is one of the presets ('' included). */
export function isPreset(value: string): value is PeriodPreset {
  return (PERIOD_PRESETS as readonly string[]).includes(value);
}

/**
 * The dates a period value means today ("this month" moves with the calendar).
 * Same ranges the old chips produced (weeks start Monday, "this …" ends today).
 */
export function periodRange(value: string, now: Date = new Date()): { from: string; to: string } {
  if (!value) return { from: '', to: '' };
  const custom = CUSTOM.exec(value);
  if (custom) return { from: custom[1] ?? '', to: custom[2] ?? '' };
  if (value === 'today' || value === 'yesterday' || value === 'this_week' || value === 'this_month' || value === 'last_month' || value === 'this_year') {
    const r = quickPeriodRange(value, now);
    return { from: r.date_from, to: r.date_to };
  }
  return { from: '', to: '' };
}

/** "01.11.2026 – 21.11.2026" for a custom value; one day shows once. */
export function formatPeriodRange(value: string): string {
  const { from, to } = periodRange(value);
  if (from && to) return from === to ? formatDmy(from) : `${formatDmy(from)} – ${formatDmy(to)}`;
  if (from) return `${formatDmy(from)} –`;
  if (to) return `– ${formatDmy(to)}`;
  return '';
}

/** Whether a period value is valid (unknown strings from an old link fall back to the default). */
export function isPeriodValue(value: string): boolean {
  return isPreset(value) || CUSTOM.test(value);
}

/** Keys whose value differs from the default — what counts as "filtered". */
export function activeKeys(values: FilterValues, defaults: FilterValues): string[] {
  return Object.keys(defaults).filter((k) => (values[k] ?? '') !== (defaults[k] ?? ''));
}

/**
 * Filters named in a query string. Returns null when the URL names none of the
 * page's filters (then the remembered view applies). When it names any, it
 * describes the whole view: the others are at their defaults.
 */
export function filtersFromQuery(search: string, defaults: FilterValues, searchKey = 'q'): { values: FilterValues; search: string } | null {
  const params = new URLSearchParams(search);
  const named = Object.keys(defaults).filter((k) => params.has(k));
  const q = params.get(searchKey) ?? '';
  if (named.length === 0 && !params.has(searchKey)) return null;
  const values: FilterValues = { ...defaults };
  for (const k of named) values[k] = params.get(k) ?? '';
  return { values, search: q };
}

/**
 * The query string for a view: the page's own filter keys are rewritten, any
 * other parameter (e.g. `?edit=`, `?tab=`) is kept. A filter at its default is
 * left out; a non-empty default set to "all" is written as `key=`.
 */
export function queryWithFilters(current: string, values: FilterValues, defaults: FilterValues, search: string, searchKey = 'q'): string {
  const params = new URLSearchParams(current);
  for (const k of Object.keys(defaults)) params.delete(k);
  params.delete(searchKey);
  for (const k of Object.keys(defaults)) {
    const v = values[k] ?? '';
    if (v !== (defaults[k] ?? '')) params.set(k, v);
  }
  if (search) params.set(searchKey, search);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Today as 'YYYY-MM-DD' in local time (calendar highlight). */
export function todayIso(now: Date = new Date()): string {
  return localIsoDate(now);
}

/** Days of a month for a Monday-first calendar: leading blanks (null) then 'YYYY-MM-DD' for each day. */
export function monthGrid(year: number, month: number): Array<string | null> {
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  return cells;
}

/** ISO date moved by n days (local calendar, DST-safe). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return localIsoDate(new Date(y, m - 1, d + n));
}
