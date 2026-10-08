import test from 'node:test';
import assert from 'node:assert/strict';
import { convertCostPriceToDocumentCurrency } from './inventory-cost.ts';

test('convertCostPriceToDocumentCurrency', async (t) => {
  await t.test('preserves native cost when the purchase and cost currencies match', () => {
    assert.equal(convertCostPriceToDocumentCurrency(10, 'USD', 12500, 'USD', 13000), 10);
  });

  await t.test('uses the saved cost rate to convert a USD cost into base UZS', () => {
    assert.equal(convertCostPriceToDocumentCurrency(10, 'USD', 12500, 'UZS', 1), 125000);
  });

  await t.test('converts a UZS cost into a USD purchase document at its exchange rate', () => {
    assert.equal(convertCostPriceToDocumentCurrency(125000, 'UZS', 1, 'USD', 12500), 10);
  });

  await t.test('does not guess when a required foreign-currency exchange rate is missing', () => {
    assert.equal(convertCostPriceToDocumentCurrency(10, 'USD', 0, 'UZS', 1), null);
    assert.equal(convertCostPriceToDocumentCurrency(125000, 'UZS', 1, 'USD', 0), null);
  });
});
