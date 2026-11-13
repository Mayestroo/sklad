/**
 * Currencies a sales document or a product sale price may use.
 */
export type SalesCurrency = 'USD' | 'UZS';

export function isSalesCurrency(value: unknown): value is SalesCurrency {
  return value === 'USD' || value === 'UZS';
}

/**
 * The tenant's sales default currency (`settings.sales.defaultCurrency`), or
 * null when it is missing or unsupported. Never guessed (ADR 0022): a form
 * that gets null leaves the currency blank for the user to choose. The
 * backend resolves a new product's price currency from the same setting.
 */
export function salesDefaultCurrency(settings: unknown): SalesCurrency | null {
  const value = (settings as { sales?: { defaultCurrency?: unknown } } | null | undefined)?.sales?.defaultCurrency;
  return isSalesCurrency(value) ? value : null;
}
