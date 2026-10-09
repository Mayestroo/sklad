import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatCurrency, formatCurrencyIfAvailable } from './utils.ts';

describe('formatCurrency - Zero-Tolerance Invariants', () => {
  test('should format valid amount, locale, and currency correctly', () => {
    const resUz = formatCurrency(1500000, 'uz', 'UZS');
    assert.strictEqual(resUz, '1,500,000.000 UZS');

    const resUsd = formatCurrency(1234.56, 'en', 'USD');
    assert.strictEqual(resUsd, '1,234.560 USD');

    const resZero = formatCurrency(0, 'uz', 'UZS');
    assert.strictEqual(resZero, '0.000 UZS');
  });

  test('should throw TypeError when amount is null or undefined', () => {
    assert.throws(() => {
      formatCurrency(null as any, 'uz', 'UZS');
    }, TypeError);

    assert.throws(() => {
      formatCurrency(undefined as any, 'uz', 'UZS');
    }, TypeError);
  });

  test('should throw TypeError when amount is NaN or non-finite', () => {
    assert.throws(() => {
      formatCurrency(NaN, 'uz', 'UZS');
    }, TypeError);

    assert.throws(() => {
      formatCurrency(Infinity, 'uz', 'UZS');
    }, TypeError);

    assert.throws(() => {
      formatCurrency(-Infinity, 'uz', 'UZS');
    }, TypeError);
  });

  test('should throw TypeError when currency is null, undefined, or empty', () => {
    assert.throws(() => {
      formatCurrency(100, 'uz', null as any);
    }, TypeError);

    assert.throws(() => {
      formatCurrency(100, 'uz', undefined as any);
    }, TypeError);

    assert.throws(() => {
      formatCurrency(100, 'uz', '');
    }, TypeError);

    assert.throws(() => {
      formatCurrency(100, 'uz', '   ');
    }, TypeError);
  });

  test('should throw TypeError when currency is omitted', () => {
    assert.throws(() => {
      (formatCurrency as any)(100, 'uz');
    }, TypeError);
  });

  test('should correctly parse numeric string amounts from API/Decimal responses', () => {
    const res = formatCurrency('1500000.00', 'uz', 'UZS');
    assert.strictEqual(res, '1,500,000.000 UZS');

    const resInt = formatCurrency('50000', 'ru', 'USD');
    assert.strictEqual(resInt, '50,000.000 USD');
  });

  test('should throw TypeError when string amount is non-numeric or empty', () => {
    assert.throws(() => {
      formatCurrency('', 'uz', 'UZS');
    }, TypeError);

    assert.throws(() => {
      formatCurrency('   ', 'uz', 'UZS');
    }, TypeError);

    assert.throws(() => {
      formatCurrency('not-a-number', 'uz', 'UZS');
    }, TypeError);
  });
});

describe('formatCurrencyIfAvailable - Optional Display Currency', () => {
  test('should skip formatting when all currency candidates are blank or missing', () => {
    assert.strictEqual(formatCurrencyIfAvailable(100, 'uz', '', '   ', undefined, null), undefined);
  });

  test('should use the first non-blank currency candidate after trimming it', () => {
    assert.strictEqual(formatCurrencyIfAvailable(100, 'uz', '  ', ' USD '), '100.000 USD');
  });

  test('should preserve strict amount validation when a currency is available', () => {
    assert.throws(() => formatCurrencyIfAvailable(NaN, 'uz', 'UZS'), /amount must be a valid finite number/);
  });
});
