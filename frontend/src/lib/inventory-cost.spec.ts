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

test('markup: same currency, a USD cost against a UZS price, and pairs that cannot be compared', async () => {
  const { catalogMarkupPercent } = await import('./inventory-cost.ts');
  // USD cost (after a receipt/expense the card stays in USD) vs USD price.
  assert.equal(catalogMarkupPercent({ costPrice: 530, costPriceCurrency: 'USD', costPriceExchangeRate: 11900, salePrice: 620, salePriceCurrency: 'USD' }), 16.98);
  // USD cost vs UZS price: the cost is converted with its own rate.
  assert.equal(catalogMarkupPercent({ costPrice: 10, costPriceCurrency: 'USD', costPriceExchangeRate: 12500, salePrice: 150000, salePriceCurrency: 'UZS' }), 20);
  // A loss is negative (shown without a "+").
  assert.equal(catalogMarkupPercent({ costPrice: 100, costPriceCurrency: 'UZS', costPriceExchangeRate: 1, salePrice: 0, salePriceCurrency: 'UZS' }), -100);
  // UZS cost vs USD price: no rate to convert with.
  assert.equal(catalogMarkupPercent({ costPrice: 100000, costPriceCurrency: 'UZS', costPriceExchangeRate: 1, salePrice: 10, salePriceCurrency: 'USD' }), null);
  // No cost or no sale-price currency.
  assert.equal(catalogMarkupPercent({ costPrice: 0, costPriceCurrency: 'UZS', salePrice: 10, salePriceCurrency: 'UZS' }), null);
  assert.equal(catalogMarkupPercent({ costPrice: 5, costPriceCurrency: 'UZS', salePrice: 10, salePriceCurrency: null }), null);
});
