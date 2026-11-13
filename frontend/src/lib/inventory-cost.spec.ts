import test from 'node:test';
import assert from 'node:assert/strict';
import { convertCostPriceToDocumentCurrency, documentUnitPriceFromProductCost } from './inventory-cost.ts';

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

test('documentUnitPriceFromProductCost (F8: no guessed currency in a purchase line price)', async (t) => {
  await t.test('leaves the price empty (0) while the document currency is blank', () => {
    assert.equal(documentUnitPriceFromProductCost({ costPrice: 125000, costPriceCurrency: 'UZS', costPriceExchangeRate: 1 }, '', 0), 0);
  });

  await t.test('leaves the price empty (0) when the product cost has no currency', () => {
    assert.equal(documentUnitPriceFromProductCost({ costPrice: 10, costPriceCurrency: null, costPriceExchangeRate: 12500 }, 'UZS', 1), 0);
  });

  await t.test('does not assume a rate of 1 for a USD cost without a rate', () => {
    assert.equal(documentUnitPriceFromProductCost({ costPrice: 10, costPriceCurrency: 'USD', costPriceExchangeRate: null }, 'UZS', 1), 0);
  });

  await t.test('converts the cost once the document currency is chosen', () => {
    assert.equal(documentUnitPriceFromProductCost({ costPrice: 125000, costPriceCurrency: 'UZS', costPriceExchangeRate: 1 }, 'USD', 12500), 10);
    assert.equal(documentUnitPriceFromProductCost({ costPrice: 10, costPriceCurrency: 'USD', costPriceExchangeRate: 12500 }, 'UZS', 1), 125000);
  });
});
