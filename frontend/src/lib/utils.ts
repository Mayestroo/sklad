/**
 * Formatting Utilities for Currency, Dates, and Numbers
 * Supporting Uzbek (uz-UZ) and Russian (ru-RU) locales
 */

/**
 * Summani valyuta kodi bilan birga formatlaydi.
 *
 * ⚠️ MUHIM: Bu funksiya natijasiga ALOHIDA `{currency}` QO'SHMANG!
 * Valyuta kodi (masalan "UZS") ichida ALLAQACHON bor.
 *
 * @example
 * // ✅ To'g'ri — "1 500 000 UZS"
 * {formatCurrency(amount, locale, currency)}
 *
 * // ❌ XATO — "1 500 000 UZS UZS" (ikki marta!)
 * {formatCurrency(amount, locale, currency)} {currency}
 */
export function formatCurrency(amount: number | string, _locale: string = 'uz', currency: string): string {
  const numericAmount =
    typeof amount === 'string' && amount.trim() !== ''
      ? Number(amount)
      : amount;

  if (numericAmount === null || numericAmount === undefined || typeof numericAmount !== 'number' || isNaN(numericAmount) || !isFinite(numericAmount)) {
    throw new TypeError(`formatCurrency: amount must be a valid finite number, received ${String(amount)}`);
  }

  if (currency === null || currency === undefined || typeof currency !== 'string' || currency.trim() === '') {
    throw new TypeError(`formatCurrency: currency must be a non-empty string, received ${String(currency)}`);
  }

  // Always format as 111,111.000 — comma thousands separator, dot decimal, 3 fixed decimals
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(numericAmount);

  const cur = currency.trim().toUpperCase();
  return `${formatted} ${cur}`;
}

/**
 * Formats an optional display amount using the first available currency.
 * Required transaction data should use `formatCurrency` directly so missing
 * currencies continue to fail explicitly.
 */
export function formatCurrencyIfAvailable(
  amount: number | string,
  locale: string = 'uz',
  ...currencies: unknown[]
): string | undefined {
  const currency = currencies.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim() !== '',
  );

  return currency ? formatCurrency(amount, locale, currency.trim()) : undefined;
}

/**
 * Valyuta select opsiyalari — butun loyihada SHU konstantani ishlating.
 *
 * ⚠️ Yangi sahifada o'z options yozмang — har doim import qiling:
 *   import { CURRENCY_OPTIONS } from '@/lib/utils';
 *
 * Qoidalar:
 * - Faqat ISO kodlari: "UZS", "USD" — qavs yoki qo'shimcha matn YO'Q
 * - "(So'm)", "($)", "UZS (So'm)" — TAQIQLANGAN
 */
export const CURRENCY_OPTIONS = [
  { value: 'UZS', label: 'UZS' },
  { value: 'USD', label: 'USD' },
];


export function formatDate(date: string | Date | null | undefined, _locale?: string): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

export function formatDateNumeric(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

export function formatDateTime(date: string | Date | null | undefined, _locale?: string): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year}, ${hours}:${minutes}`;
}

/**
 * Extracts the localized string from a name that might be an object { uz: string, ru: string } or a plain string.
 */
export type LocalizedName = string | { uz?: string; ru?: string };

export function getLocalizedName(name: LocalizedName | null | undefined, locale: string = 'uz'): string {
  if (!name) return '—';
  if (typeof name === 'string') return name;
  const byLocale = name as Record<string, string | undefined>;
  return byLocale[locale] || name.ru || name.uz || Object.values(byLocale)[0] || '—';
}

/**
 * The message of a caught error, or `undefined` when the thrown value has no
 * string `message` (callers keep their own fallback text). Use in
 * `catch (err)` blocks instead of typing the error as `any`.
 */
export function errorMessage(err: unknown): string | undefined {
  if (err !== null && typeof err === 'object' && 'message' in err) {
    const { message } = err as { message: unknown };
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}
