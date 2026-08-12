/**
 * Formatting Utilities for Currency, Dates, and Numbers
 * Supporting Uzbek (uz-UZ) and Russian (ru-RU) locales
 */

export function formatCurrency(amount: number, locale: string = 'uz', currency?: string): string {
  const formatted = new Intl.NumberFormat(locale === 'uz' ? 'uz-UZ' : 'ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount || 0);

  if (!currency) {
    return `${formatted} ${locale === 'uz' ? "so'm" : 'сум'}`;
  }

  const curUpper = currency.toUpperCase();
  if (curUpper === 'UZS' || curUpper === "SO'M" || curUpper === 'SOM') {
    return `${formatted} ${locale === 'uz' ? "so'm" : 'сум'}`;
  }

  return `${formatted} ${currency}`;
}

const UZ_MONTHS_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const RU_MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

export function formatDate(date: string | Date | null | undefined, locale: string = 'uz'): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const day = d.getDate();
  const monthIdx = d.getMonth();
  const year = d.getFullYear();

  const month = locale === 'ru' ? RU_MONTHS_SHORT[monthIdx] : UZ_MONTHS_SHORT[monthIdx];
  return `${day} ${month} ${year}`;
}

export function formatDateNumeric(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}.${month}.${year}`;
}

export function formatDateTime(date: string | Date | null | undefined, locale: string = 'uz'): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const day = d.getDate();
  const monthIdx = d.getMonth();
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  const month = locale === 'ru' ? RU_MONTHS_SHORT[monthIdx] : UZ_MONTHS_SHORT[monthIdx];
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}
