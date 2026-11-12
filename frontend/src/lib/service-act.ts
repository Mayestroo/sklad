/**
 * Builds the service-act request body from form state, validating instead of
 * substituting defaults: no `|| 1` exchange rate, quantity or price (ADR 0022).
 */
export interface ServiceActFormItem {
  productId?: string;
  serviceName: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

export interface ServiceActForm {
  type: 'PROVIDED' | 'RECEIVED';
  counterpartyId: string;
  actDate: string;
  currency: string;
  /** Empty string while the user has not entered a rate. */
  exchangeRate: number | '';
  externalNumber?: string;
  externalDate?: string;
  notes?: string;
  items: ServiceActFormItem[];
}

export interface ServiceActPayload {
  type: 'PROVIDED' | 'RECEIVED';
  counterpartyId: string;
  actDate: string;
  currency: string;
  exchangeRate: number;
  externalNumber?: string;
  externalDate?: string;
  notes?: string;
  items: Array<{
    productId?: string;
    serviceName: string;
    description?: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
  }>;
}

export type ServiceActPayloadResult =
  | { ok: true; payload: ServiceActPayload }
  | { ok: false; error: string };

export function buildServiceActPayload(
  form: ServiceActForm,
  locale: 'uz' | 'ru',
): ServiceActPayloadResult {
  const isRu = locale === 'ru';
  const fail = (ru: string, uz: string): ServiceActPayloadResult => ({
    ok: false,
    error: isRu ? ru : uz,
  });

  if (!form.counterpartyId) {
    return fail('Пожалуйста, выберите контрагента', 'Iltimos, kontragentni tanlang');
  }
  if (!form.currency) {
    return fail('Пожалуйста, выберите валюту', 'Iltimos, valyutani tanlang');
  }
  const rate = Number(form.exchangeRate);
  if (form.currency !== 'UZS' && !(rate > 0)) {
    return fail('Курс валюты должен быть больше 0', 'Valyuta kursi 0 dan katta bo‘lishi shart');
  }
  for (const it of form.items) {
    if (!it.serviceName.trim()) {
      return fail(
        'Наименование услуги обязательно для всех строк',
        'Barcha qatorlarda xizmat nomi kiritilishi shart',
      );
    }
    if (!(Number(it.quantity) > 0)) {
      return fail('Количество должно быть больше 0', 'Miqdor 0 dan katta bo‘lishi shart');
    }
    if (!(Number(it.unitPrice) >= 0)) {
      return fail('Цена не может быть отрицательной', 'Narx manfiy bo‘lishi mumkin emas');
    }
  }

  return {
    ok: true,
    payload: {
      type: form.type,
      counterpartyId: form.counterpartyId,
      actDate: form.actDate,
      currency: form.currency,
      exchangeRate: form.currency === 'UZS' ? 1 : rate,
      externalNumber: form.externalNumber?.trim() || undefined,
      externalDate: form.externalDate || undefined,
      notes: form.notes?.trim() || undefined,
      items: form.items.map((it) => ({
        productId: it.productId || undefined,
        serviceName: it.serviceName.trim(),
        description: it.description?.trim() || undefined,
        unit: it.unit,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        vatRate: Number(it.vatRate) || 0,
      })),
    },
  };
}
