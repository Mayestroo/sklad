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
