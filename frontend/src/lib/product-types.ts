/**
 * Nomenclature types as users read them (TZ "Ishlab chiqarish" 3.1):
 * Tovar | Xomashyo | Tayyor mahsulot | Xizmat (+ the legacy To'plam).
 * The finished product is stored as FINISHED_PRODUCT.
 */
export type ProductTypeCode = 'PRODUCT' | 'RAW_MATERIAL' | 'FINISHED_PRODUCT' | 'SERVICE' | 'BUNDLE';

const LABELS: Record<ProductTypeCode, { uz: string; ru: string }> = {
  PRODUCT: { uz: 'Tovar', ru: 'Товар' },
  RAW_MATERIAL: { uz: 'Xomashyo', ru: 'Сырьё' },
  FINISHED_PRODUCT: { uz: 'Tayyor mahsulot', ru: 'Готовый продукт' },
  SERVICE: { uz: 'Xizmat', ru: 'Услуга' },
  BUNDLE: { uz: 'To‘plam', ru: 'Комплект' },
};

export function productTypeLabel(type: string | null | undefined, locale: string): string {
  const label = LABELS[(type || 'PRODUCT') as ProductTypeCode] ?? LABELS.PRODUCT;
  return locale === 'ru' ? label.ru : label.uz;
}

/** "Yarim tayyor mahsulot" badge text. */
export function semiFinishedLabel(locale: string): string {
  return locale === 'ru' ? 'Полуфабрикат' : 'Yarim tayyor';
}

/** Filter options in the order of TZ 3.1; `allLabel` adds the empty choice first. */
export function productTypeOptions(locale: string, allLabel?: string): Array<{ value: string; label: string }> {
  const types: ProductTypeCode[] = ['PRODUCT', 'RAW_MATERIAL', 'FINISHED_PRODUCT', 'SERVICE'];
  return [
    ...(allLabel ? [{ value: '', label: allLabel }] : []),
    ...types.map((type) => ({ value: type, label: productTypeLabel(type, locale) })),
  ];
}

/** TZ 7: purchases list only Tovar and Xomashyo (and services). */
export function isPurchasable(product: { type?: string | null }): boolean {
  return product.type !== 'FINISHED_PRODUCT';
}

/**
 * TZ 4.6: a semi-finished product shows in sales only when it has a sale
 * price; every other stock item is sellable.
 */
export function isSellable(product: { type?: string | null; isSemiFinished?: boolean | null; salePrice?: number | string | null }): boolean {
  if (product.type === 'RAW_MATERIAL') return true;
  if (product.type === 'FINISHED_PRODUCT' && product.isSemiFinished) return Number(product.salePrice ?? 0) > 0;
  return true;
}
