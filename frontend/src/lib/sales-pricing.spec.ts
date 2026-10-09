import { test, describe } from 'node:test';
import assert from 'node:assert';
import { convertSalePriceToDocumentCurrency } from './sales-pricing.ts';

describe('convertSalePriceToDocumentCurrency', () => {
  test('keeps a sale price unchanged when product and document currencies match', () => {
    assert.strictEqual(convertSalePriceToDocumentCurrency(12.345, 'USD', 'USD', 12800), 12.35);
  });

  test('converts a USD product price to UZS with the document exchange rate', () => {
    assert.strictEqual(convertSalePriceToDocumentCurrency(10, 'USD', 'UZS', 12800), 128000);
  });

  test('converts a UZS product price to USD with the document exchange rate', () => {
    assert.strictEqual(convertSalePriceToDocumentCurrency(128000, 'UZS', 'USD', 12800), 10);
  });

  test('returns null rather than guessing when product price currency is unresolved', () => {
    assert.strictEqual(convertSalePriceToDocumentCurrency(100, null, 'USD', 12800), null);
  });

  test('returns null for an unsupported currency or missing conversion rate', () => {
    assert.strictEqual(convertSalePriceToDocumentCurrency(100, 'EUR', 'USD', 12800), null);
    assert.strictEqual(convertSalePriceToDocumentCurrency(100, 'UZS', 'USD', 0), null);
  });
});
