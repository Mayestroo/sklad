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

/**
 * The currency a sales order or invoice form starts with: the saved
 * document's currency, else the tenant sales default, else blank (the form
 * then asks for it). Never a guessed currency (ADR 0022).
 */
export function initialDocumentCurrency(
  saved: string | null | undefined,
  salesDefault: SalesCurrency | null,
): string {
  return saved || salesDefault || '';
}
