export type SalePriceCurrency = 'USD' | 'UZS';

const SUPPORTED_CURRENCIES: readonly SalePriceCurrency[] = ['USD', 'UZS'];

/** Convert a catalog sale price into the selected sales-document currency. */
export function convertSalePriceToDocumentCurrency(
  amount: number,
  salePriceCurrency: string | null | undefined,
  documentCurrency: string,
  exchangeRate: number,
): number | null {
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !SUPPORTED_CURRENCIES.includes(salePriceCurrency as SalePriceCurrency) ||
    !SUPPORTED_CURRENCIES.includes(documentCurrency as SalePriceCurrency)
  ) {
    return null;
  }

  if (salePriceCurrency === documentCurrency) return roundMoney(amount);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return null;

  if (salePriceCurrency === 'USD' && documentCurrency === 'UZS') {
    return roundMoney(amount * exchangeRate);
  }
  if (salePriceCurrency === 'UZS' && documentCurrency === 'USD') {
    return roundMoney(amount / exchangeRate);
  }
  return null;
}

function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
