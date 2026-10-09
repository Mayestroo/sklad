import { BadRequestException } from '@nestjs/common';

export function requireExchangeRateForCurrency(
  currency: string,
  exchangeRate?: number | null,
): number {
  if (currency === 'UZS') {
    if (exchangeRate != null && exchangeRate !== 1) {
      throw new BadRequestException(
        'UZS transactions must use an exchange rate of 1',
      );
    }
    return 1;
  }

  if (
    currency === 'USD' &&
    exchangeRate != null &&
    Number.isFinite(exchangeRate) &&
    exchangeRate > 0
  ) {
    const normalizedRate = Math.round(exchangeRate * 10000) / 10000;
    if (normalizedRate > 0 && normalizedRate <= 99999999999.9999) {
      return normalizedRate;
    }
  }

  throw new BadRequestException(
    currency === 'USD'
      ? 'USD transactions require an exchange rate greater than 0'
      : 'Transaction currency must be USD or UZS',
  );
}

export function convertAmountToUzs(
  amount: number,
  currency: string,
  exchangeRate?: number | null,
): number {
  if (!Number.isFinite(amount)) {
    throw new BadRequestException('Monetary amount must be finite');
  }
  const rate = requireExchangeRateForCurrency(currency, exchangeRate);
  const amountInUzs = currency === 'UZS' ? amount : amount * rate;
  return Math.round(amountInUzs * 100) / 100;
}
