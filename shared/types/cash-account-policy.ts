export type CashAccountKind = 'UZS_CASH' | 'USD_CASH' | 'BANK';
export type CashCurrency = 'UZS' | 'USD';
export type SalesPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'CLICK' | 'PAYME';

export interface CashAccountIdentity {
  accountType: string;
  currency: string;
}

export function isCashAccountCurrencyValid(
  account: CashAccountIdentity,
): account is CashAccountIdentity & { currency: CashCurrency } {
  if (account.accountType === 'UZS_CASH') return account.currency === 'UZS';
  if (account.accountType === 'USD_CASH') return account.currency === 'USD';
  return account.accountType === 'BANK' && ['UZS', 'USD'].includes(account.currency);
}

export function requiredAccountTypeForSalesPayment(
  method: SalesPaymentMethod,
  currency: string,
): CashAccountKind | null {
  if (method !== 'CASH') return 'BANK';
  if (currency === 'USD') return 'USD_CASH';
  if (currency === 'UZS') return 'UZS_CASH';
  return null;
}

export function isCashAccountCompatibleWithSalesPayment(
  account: CashAccountIdentity,
  method: SalesPaymentMethod,
  currency: string,
): boolean {
  const requiredAccountType = requiredAccountTypeForSalesPayment(method, currency);
  return requiredAccountType !== null
    && isCashAccountCurrencyValid(account)
    && account.currency === currency
    && account.accountType === requiredAccountType;
}

export function ledgerAccountCodeForCashAccount(
  account: CashAccountIdentity,
): string | null {
  if (!isCashAccountCurrencyValid(account)) return null;
  if (account.accountType === 'UZS_CASH') return '5010';
  if (account.accountType === 'USD_CASH') return '5020';
  return account.currency === 'USD' ? '5210' : '5110';
}
