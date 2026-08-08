/**
 * Formatting Utilities for Currency, Dates, and Numbers
 * Supporting Uzbek (uz-UZ) and Russian (ru-RU) locales
 */

export function formatCurrency(amount: number, locale: string = 'uz'): string {
  const formatted = new Intl.NumberFormat(locale === 'uz' ? 'uz-UZ' : 'ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${formatted} ${locale === 'uz' ? "so'm" : 'сум'}`;
}

export function formatDate(date: string | Date, locale: string = 'uz'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : 'ru-RU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function formatDateTime(date: string | Date, locale: string = 'uz'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : 'ru-RU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
