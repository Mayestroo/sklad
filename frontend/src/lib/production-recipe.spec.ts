import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryUnitsFor, estimateRecipeCost, toCardQuantity, unitCostUzs } from './production-recipe.ts';

test('a material is typed in its card unit or a smaller unit of the same kind', () => {
  assert.deepEqual(entryUnitsFor('kg').map((u) => u.code), ['kg', 'g']);
  assert.deepEqual(entryUnitsFor('liter').map((u) => u.code), ['liter', 'ml']);
  assert.deepEqual(entryUnitsFor('meter').map((u) => u.code), ['meter', 'cm', 'mm']);
  assert.deepEqual(entryUnitsFor('piece').map((u) => u.code), ['piece']);
  assert.deepEqual(entryUnitsFor('qop').map((u) => u.code), ['qop'], 'a custom unit has no sub-units');
});

test('grams, ml and cm are converted to the card unit before saving', () => {
  assert.equal(toCardQuantity('250', 'g', 'kg'), 0.25);
  assert.equal(toCardQuantity(1500, 'ml', 'liter'), 1.5);
  assert.equal(toCardQuantity(35, 'cm', 'meter'), 0.35);
  assert.equal(toCardQuantity(2, 'kg', 'kg'), 2);
});

test('a quantity finer than 3 decimals of the card unit, zero or blank is refused', () => {
  assert.equal(toCardQuantity('0.4', 'g', 'kg'), null);
  assert.equal(toCardQuantity('0', 'kg', 'kg'), null);
  assert.equal(toCardQuantity('', 'kg', 'kg'), null);
  assert.equal(toCardQuantity('5', 'g', 'piece'), null, 'unit not allowed for this card');
});

test('card cost in UZS; a USD cost uses the card rate and is never guessed', () => {
  assert.equal(unitCostUzs({ costPrice: 12000, costPriceCurrency: 'UZS' }), 12000);
  assert.equal(unitCostUzs({ costPrice: 2, costPriceCurrency: 'USD', costPriceExchangeRate: 12500 }), 25000);
  assert.equal(unitCostUzs({ costPrice: 2, costPriceCurrency: 'USD', costPriceExchangeRate: 0 }), null);
  assert.equal(unitCostUzs({ costPrice: 0, costPriceCurrency: 'UZS' }), null);
  assert.equal(unitCostUzs(undefined), null);
});

test('recipe cost: line totals, the norm total and the cost of one finished unit', () => {
  const estimate = estimateRecipeCost(
    [
      { quantity: 0.25, card: { costPrice: 40000, costPriceCurrency: 'UZS' } },
      { quantity: 2, card: { costPrice: 1, costPriceCurrency: 'USD', costPriceExchangeRate: 12500 } },
      { quantity: null, card: { costPrice: 5, costPriceCurrency: 'UZS' } },
    ],
    10,
  );
  assert.deepEqual(estimate.lines.map((l) => l.total), [10000, 25000, null]);
  assert.equal(estimate.total, 35000);
  assert.equal(estimate.perUnit, 3500);
  assert.equal(estimate.incomplete, false, 'an unfinished line is not a missing cost');
});

test('a material without a card cost makes the estimate incomplete', () => {
  const estimate = estimateRecipeCost([{ quantity: 1, card: { costPrice: 0, costPriceCurrency: 'UZS' } }], 1);
  assert.equal(estimate.total, 0);
  assert.equal(estimate.incomplete, true);
  assert.equal(estimateRecipeCost([], 0).perUnit, null);
});
