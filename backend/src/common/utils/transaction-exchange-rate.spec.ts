import { BadRequestException } from '@nestjs/common';
import {
  convertAmountToUzs,
  requireExchangeRateForCurrency,
} from './transaction-exchange-rate';

describe('requireExchangeRateForCurrency', () => {
  it('uses base rate 1 for UZS transactions', () => {
    expect(requireExchangeRateForCurrency('UZS')).toBe(1);
    expect(requireExchangeRateForCurrency('UZS', 1)).toBe(1);
  });

  it('requires an explicit positive UZS-per-USD rate for USD transactions', () => {
    expect(requireExchangeRateForCurrency('USD', 12800)).toBe(12800);
    expect(requireExchangeRateForCurrency('USD', 12800.123456)).toBe(
      12800.1235,
    );
    expect(() => requireExchangeRateForCurrency('USD')).toThrow(
      BadRequestException,
    );
    expect(() => requireExchangeRateForCurrency('USD', 0)).toThrow(
      BadRequestException,
    );
    expect(() => requireExchangeRateForCurrency('USD', 0.00001)).toThrow(
      BadRequestException,
    );
  });

  it('rejects a non-base rate on UZS transactions and unsupported currencies', () => {
    expect(() => requireExchangeRateForCurrency('UZS', 12800)).toThrow(
      BadRequestException,
    );
    expect(() => requireExchangeRateForCurrency('EUR', 1)).toThrow(
      BadRequestException,
    );
  });

  it('converts monetary journal values to UZS using the required transaction rate', () => {
    expect(convertAmountToUzs(100, 'USD', 12800)).toBe(1280000);
    expect(convertAmountToUzs(125000, 'UZS')).toBe(125000);
  });

  it('rejects non-finite journal values instead of silently treating them as zero', () => {
    expect(() => convertAmountToUzs(Number.NaN, 'UZS')).toThrow(
      BadRequestException,
    );
  });
});
