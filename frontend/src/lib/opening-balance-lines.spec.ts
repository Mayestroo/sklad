import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withProductCost } from './opening-balance-lines.ts';

test('an empty inventory line takes the product card cost in the card currency', () => {
  const line = withProductCost({ quantity: 2, unitCost: null, currency: 'UZS', exchangeRate: 1 }, { costPrice: 550, costPriceCurrency: 'USD' });
  assert.equal(line.unitCost, 550);
  assert.equal(line.currency, 'USD');
  assert.equal(line.exchangeRate, '', 'the USD rate is left for the user (ADR 0022)');
  assert.equal(line.amount, 1100);
});

test('a UZS card cost comes with rate 1', () => {
  const line = withProductCost({ quantity: 3 }, { costPrice: 6545000, costPriceCurrency: 'UZS' });
  assert.equal(line.exchangeRate, 1);
  assert.equal(line.amount, 19635000);
});

test('a typed cost is kept; a card without cost or currency changes nothing', () => {
  const typed = { quantity: 2, unitCost: 4, currency: 'UZS', amount: 8 };
  assert.equal(withProductCost(typed, { costPrice: 550, costPriceCurrency: 'USD' }), typed);
  const empty = { quantity: 1 };
  assert.equal(withProductCost(empty, { costPrice: 0, costPriceCurrency: 'UZS' }), empty);
  assert.equal(withProductCost(empty, { costPrice: 10, costPriceCurrency: null }), empty);
  assert.equal(withProductCost(empty, undefined), empty);
});
