/**
 * Words for platform codes that otherwise leak onto the screen as raw enums
 * (plans, company statuses, audit actions and objects). One list, used by the
 * company settings and the platform owner pages alike.
 */
export type Loc = 'uz' | 'ru';
type Variant = 'neutral' | 'info' | 'success' | 'warning' | 'error';
interface Label {
  uz: string;
  ru: string;
  variant: Variant;
}

export const PLAN_LABELS: Record<string, Label> = {
  STARTER: { uz: 'Boshlang‘ich', ru: 'Стартовый', variant: 'neutral' },
  PROFESSIONAL: { uz: 'Professional', ru: 'Профессиональный', variant: 'info' },
  ENTERPRISE: { uz: 'Korporativ', ru: 'Корпоративный', variant: 'success' },
};

export const COMPANY_STATUS_LABELS: Record<string, Label> = {
  TRIAL: { uz: 'Sinov davri', ru: 'Пробный период', variant: 'warning' },
  ACTIVE: { uz: 'Faol', ru: 'Активна', variant: 'success' },
  OVERDUE: { uz: 'To‘lov muddati o‘tgan', ru: 'Просрочена оплата', variant: 'error' },
  CANCELLED: { uz: 'Bekor qilingan', ru: 'Отменена', variant: 'neutral' },
  SUSPENDED: { uz: 'To‘xtatilgan', ru: 'Приостановлена', variant: 'error' },
  BLOCKED: { uz: 'Bloklangan', ru: 'Заблокирована', variant: 'error' },
};

export const AUDIT_ACTION_LABELS: Record<string, Label> = {
  CREATE: { uz: 'Yaratdi', ru: 'Создал', variant: 'success' },
  UPDATE: { uz: 'O‘zgartirdi', ru: 'Изменил', variant: 'info' },
  DELETE: { uz: 'O‘chirdi', ru: 'Удалил', variant: 'error' },
  LOGIN: { uz: 'Tizimga kirdi', ru: 'Вошёл в систему', variant: 'neutral' },
  LOGOUT: { uz: 'Tizimdan chiqdi', ru: 'Вышел из системы', variant: 'neutral' },
};

export const AUDIT_ENTITY_LABELS: Record<string, { uz: string; ru: string }> = {
  AccountingPeriod: { uz: 'Hisob davri', ru: 'Учётный период' },
  AdditionalExpense: { uz: 'Qo‘shimcha xarajat', ru: 'Доп. расход' },
  Company: { uz: 'Kompaniya', ru: 'Компания' },
  CompanySettings: { uz: 'Kompaniya sozlamalari', ru: 'Настройки компании' },
  InventoryDocument: { uz: 'Ombor hujjati', ru: 'Складской документ' },
  Payment: { uz: 'To‘lov', ru: 'Оплата' },
  ProductionDocument: { uz: 'Ishlab chiqarish hujjati', ru: 'Документ производства' },
  ProductionMaterialLine: { uz: 'Xomashyo qatori', ru: 'Строка сырья' },
  ProductionRecipe: { uz: 'Retsept', ru: 'Рецепт' },
  PurchaseReceipt: { uz: 'Kirim hujjati', ru: 'Приходный документ' },
  PurchaseReturn: { uz: 'Yetkazib beruvchiga qaytarish', ru: 'Возврат поставщику' },
  SalesInvoice: { uz: 'Sotuv hujjati', ru: 'Продажа' },
  SalesOrder: { uz: 'Buyurtma', ru: 'Заказ' },
  SalesReturn: { uz: 'Mijozdan qaytarish', ru: 'Возврат покупателя' },
  StockTransfer: { uz: 'Omborlararo ko‘chirish', ru: 'Перемещение' },
  User: { uz: 'Foydalanuvchi', ru: 'Пользователь' },
};

/** The label in the current language, or the code itself when it is unknown. */
export function labelOf(map: Record<string, { uz: string; ru: string }>, code: string | null | undefined, locale: Loc): string {
  if (!code) return '—';
  const l = map[code];
  return l ? l[locale] : code;
}

export function variantOf(map: Record<string, Label>, code: string | null | undefined): Variant {
  return (code && map[code]?.variant) || 'neutral';
}
