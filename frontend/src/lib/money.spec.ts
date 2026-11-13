import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  formatAmount,
  formatCompactNumber,
  formatMoney,
  formatNumber,
  formatPercent,
  formatQuantity,
} from '../../../shared/format/money.ts';

// Non-breaking space: the thousands separator and the gap before the code.
const _ = String.fromCharCode(0xa0);

describe('formatMoney (D8: local money format)', () => {
  const cases: Array<[number | string, string, string]> = [
    [0, 'UZS', `0${_}UZS`],
    [8000, 'UZS', `8${_}000${_}UZS`],
    [8000.5, 'UZS', `8${_}000,50${_}UZS`],
    [1234567.891, 'UZS', `1${_}234${_}567,89${_}UZS`],
    [-8000, 'UZS', `-8${_}000${_}UZS`],
    [-1234567.891, 'UZS', `-1${_}234${_}567,89${_}UZS`],
    [0.004, 'UZS', `0${_}UZS`],
    [-0.004, 'UZS', `0${_}UZS`],
    [0.01, 'UZS', `0,01${_}UZS`],
    [999.999, 'UZS', `1${_}000${_}UZS`],
    [0, 'USD', `0,00${_}USD`],
    [8000, 'USD', `8${_}000,00${_}USD`],
    [1234.56, 'USD', `1${_}234,56${_}USD`],
    [1234567.891, 'USD', `1${_}234${_}567,89${_}USD`],
    [-12.5, 'USD', `-12,50${_}USD`],
    [0.001, 'USD', `0,00${_}USD`],
    [-0.001, 'USD', `0,00${_}USD`],
    [1.005, 'USD', `1,01${_}USD`],
    ['8000', 'UZS', `8${_}000${_}UZS`],
    [8000, ' usd ', `8${_}000,00${_}USD`],
    [100, 'EUR', `100,00${_}EUR`],
  ];
  for (const [amount, currency, expected] of cases) {
    test(`${String(amount)} ${currency} -> ${expected}`, () => {
      assert.strictEqual(formatMoney(amount, currency), expected);
    });
  }

  test('never reads as a smaller number: 8000 UZS has no dot and no 3 decimals', () => {
    const text = formatMoney(8000, 'UZS');
    assert.ok(!text.includes('.'));
    assert.ok(!/,\d{3}\b/.test(text));
  });

  test('formatAmount is the number part only', () => {
    assert.strictEqual(formatAmount(8000.5, 'UZS'), `8${_}000,50`);
    assert.strictEqual(formatAmount(8000, 'USD'), `8${_}000,00`);
  });

  test('rejects invalid amounts and missing currency (ADR 0022: no fallbacks)', () => {
    assert.throws(() => formatMoney(Number.NaN, 'UZS'), TypeError);
    assert.throws(() => formatMoney(Infinity, 'UZS'), TypeError);
    assert.throws(() => formatMoney('', 'UZS'), TypeError);
    assert.throws(() => formatMoney('abc', 'UZS'), TypeError);
    assert.throws(() => formatMoney(null as unknown as number, 'UZS'), TypeError);
    assert.throws(() => formatMoney(1, ''), TypeError);
    assert.throws(() => formatMoney(1, undefined as unknown as string), TypeError);
  });

  test('very large values do not switch to exponent notation', () => {
    assert.strictEqual(
      formatMoney(1e15, 'UZS'),
      `1${_}000${_}000${_}000${_}000${_}000${_}UZS`,
    );
  });
});

describe('formatQuantity', () => {
  const cases: Array<[number | string, string]> = [
    [0, '0'],
    [2, '2'],
    [2.5, '2,5'],
    [1000, `1${_}000`],
    [1234567.891, `1${_}234${_}567,891`],
    [0.0004, '0'],
    [0.001, '0,001'],
    [-3.25, '-3,25'],
    [1.23456, '1,235'],
    ['12.500', '12,5'],
  ];
  for (const [value, expected] of cases) {
    test(`${String(value)} -> ${expected}`, () => {
      assert.strictEqual(formatQuantity(value), expected);
    });
  }
});

describe('formatPercent and formatNumber', () => {
  test('percent keeps a fixed number of decimals', () => {
    assert.strictEqual(formatPercent(12.345), '12,3%');
    assert.strictEqual(formatPercent(0), '0,0%');
    assert.strictEqual(formatPercent(-5), '-5,0%');
    assert.strictEqual(formatPercent(1234.5, 0), `1${_}235%`);
  });

  test('formatNumber respects min/max fraction digits', () => {
    assert.strictEqual(formatNumber(12650.5, { maximumFractionDigits: 4 }), `12${_}650,5`);
    assert.strictEqual(formatNumber(12650, { minimumFractionDigits: 2 }), `12${_}650,00`);
  });
});

describe('formatCompactNumber (chart axes)', () => {
  const cases: Array<[number, string]> = [
    [0, '0'],
    [950, '950'],
    [1500, '2K'],
    [950000, '950K'],
    [1500000, '1,5M'],
    [2100000000, '2,1B'],
    [-1500000, '-1,5M'],
  ];
  for (const [value, expected] of cases) {
    test(`${value} -> ${expected}`, () => {
      assert.strictEqual(formatCompactNumber(value), expected);
    });
  }
});
