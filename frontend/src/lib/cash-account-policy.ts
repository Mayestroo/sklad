import type { CashAccount } from '@shared/types';

export type SalesPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'CLICK' | 'PAYME';

export function isCashAccountCurrencyValid(
  account: Pick<CashAccount, 'accountType' | 'currency'>,
): boolean {
  if (account.accountType === 'UZS_CASH') return account.currency === 'UZS';
  if (account.accountType === 'USD_CASH') return account.currency === 'USD';
  return account.accountType === 'BANK' && ['UZS', 'USD'].includes(account.currency);
}

export function requiredAccountTypeForSalesPayment(
  method: SalesPaymentMethod,
  currency: string,
): CashAccount['accountType'] | null {
  if (method !== 'CASH') return 'BANK';
  if (currency === 'USD') return 'USD_CASH';
  if (currency === 'UZS') return 'UZS_CASH';
  return null;
}

export function isCashAccountCompatibleWithSalesPayment(
  account: Pick<CashAccount, 'accountType' | 'currency'>,
  method: SalesPaymentMethod,
  currency: string,
): boolean {
  const requiredAccountType = requiredAccountTypeForSalesPayment(method, currency);
  return requiredAccountType !== null
    && isCashAccountCurrencyValid(account)
    && account.currency === currency
    && account.accountType === requiredAccountType;
}
