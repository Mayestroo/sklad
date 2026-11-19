/**
 * Canonical Document & Payment Status Labels and Badge Variants
 * Uzbek and Russian localizations for all document lifecycles
 */

export type StatusBadgeVariant = 'neutral' | 'info' | 'warning' | 'success' | 'error';

export interface StatusMeta {
  uz: string;
  ru: string;
  variant: StatusBadgeVariant;
}

export const ORDER_STATUS_LABELS: Record<string, StatusMeta> = {
  NEW: { uz: 'Yangi', ru: 'Новый', variant: 'neutral' },
  PENDING_APPROVAL: { uz: 'Tasdiqlashda', ru: 'На согласовании', variant: 'warning' },
  APPROVED: { uz: 'Tasdiqlangan', ru: 'Согласован', variant: 'info' },
  ACCEPTED: { uz: 'Qabul qilindi', ru: 'Принят', variant: 'info' },
  PROCESSING: { uz: 'Yig‘ilmoqda', ru: 'В сборке', variant: 'warning' },
  SENT_TO_PRODUCTION: { uz: 'Ishlab chiqarishga yuborilgan', ru: 'Передан в пр-во', variant: 'info' },
  IN_PRODUCTION: { uz: 'Ishlab chiqarilmoqda', ru: 'В производстве', variant: 'warning' },
  PARTIALLY_READY: { uz: 'Qisman tayyor', ru: 'Частично готов', variant: 'warning' },
  READY: { uz: 'Tayyor', ru: 'Готов', variant: 'success' },
  AWAITING_PAYMENT: { uz: 'To‘lov kutilmoqda', ru: 'Ожидает оплаты', variant: 'warning' },
  PAYMENT_CONFIRMED: { uz: 'To‘lov tasdiqlandi', ru: 'Оплата подтверждена', variant: 'success' },
  READY_TO_SHIP: { uz: 'Jo‘natishga tayyor', ru: 'Готов к отгрузке', variant: 'success' },
  READY_FOR_SHIPMENT: { uz: 'Jo‘natishga tayyor', ru: 'Готов к отгрузке', variant: 'success' },
  PARTIALLY_SHIPPED: { uz: 'Qisman jo‘natilgan', ru: 'Частично отгружен', variant: 'warning' },
  SHIPPED: { uz: 'Jo‘natilgan', ru: 'Отгружен', variant: 'success' },
  COMPLETED: { uz: 'Bajarildi', ru: 'Завершён', variant: 'success' },
  CANCELLED: { uz: 'Bekor qilingan', ru: 'Отменён', variant: 'error' },
};

export const DOCUMENT_STATUS_LABELS: Record<string, StatusMeta> = {
  DRAFT: { uz: 'Qoralama', ru: 'Черновик', variant: 'neutral' },
  POSTED: { uz: 'Tasdiqlangan', ru: 'Проведён', variant: 'success' },
  CANCELLED: { uz: 'Bekor qilingan', ru: 'Отменён', variant: 'error' },
  CLOSED: { uz: 'Yopilgan', ru: 'Закрыт', variant: 'neutral' },
};

export const PAYMENT_STATUS_LABELS: Record<string, StatusMeta> = {
  UNPAID: { uz: 'To‘lanmagan', ru: 'Не оплачен', variant: 'error' },
  PARTIALLY_PAID: { uz: 'Qisman to‘langan', ru: 'Частично оплачен', variant: 'warning' },
  PAID: { uz: 'To‘liq to‘langan', ru: 'Оплачен', variant: 'success' },
};

/** Subscription (billing) payment statuses. */
export const BILLING_PAYMENT_STATUS_LABELS: Record<string, StatusMeta> = {
  PAID: { uz: 'To‘langan', ru: 'Оплачен', variant: 'success' },
  PENDING: { uz: 'Kutilmoqda', ru: 'Ожидает', variant: 'warning' },
  FAILED: { uz: 'Muvaffaqiyatsiz', ru: 'Ошибка', variant: 'error' },
  CANCELLED: { uz: 'Bekor qilingan', ru: 'Отменён', variant: 'error' },
  REFUNDED: { uz: 'Qaytarilgan', ru: 'Возвращён', variant: 'neutral' },
};

/** Kassa kinds as the user reads them (never "USD_CASH"). */
export const CASH_ACCOUNT_TYPE_LABELS: Record<string, { uz: string; ru: string }> = {
  UZS_CASH: { uz: 'naqd, so‘m', ru: 'наличные, сум' },
  USD_CASH: { uz: 'naqd, dollar', ru: 'наличные, доллар' },
  BANK: { uz: 'bank', ru: 'банк' },
};

export const PAYMENT_METHOD_LABELS: Record<string, { uz: string; ru: string }> = {
  CASH: { uz: 'Naqd pul', ru: 'Наличные' },
  BANK_TRANSFER: { uz: 'Bank o‘tkazmasi', ru: 'Банковский перевод' },
  CARD: { uz: 'Karta', ru: 'Карта' },
  CLICK: { uz: 'Click', ru: 'Click' },
  PAYME: { uz: 'Payme', ru: 'Payme' },
};

/**
 * Label and badge variant of a status in the user's language. An unknown
 * code is shown as is (better than nothing) with a neutral badge.
 */
export function statusLabel(
  labels: Record<string, { uz: string; ru: string; variant?: StatusBadgeVariant }>,
  status: string | null | undefined,
  locale: string,
): { text: string; variant: StatusBadgeVariant } {
  const meta = status ? labels[status] : undefined;
  if (!meta) return { text: status || '—', variant: 'neutral' };
  return { text: locale === 'ru' ? meta.ru : meta.uz, variant: meta.variant ?? 'neutral' };
}
