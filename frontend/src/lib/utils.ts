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
export function formatCurrency(amount: number, locale: string = 'uz', currency: string = 'UZS'): string {
  // Always format as 111,111.000 — comma thousands separator, dot decimal, 3 fixed decimals
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount || 0);

  const cur = (currency || 'UZS').toUpperCase();
  return `${formatted} ${cur}`;
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

const UZ_MONTHS_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const RU_MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

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
export function getLocalizedName(name: any, locale: string = 'uz'): string {
  if (!name) return '—';
  if (typeof name === 'string') return name;
  return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
}
