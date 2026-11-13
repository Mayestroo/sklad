import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withProductCost, withRegisterAsset } from './opening-balance-lines.ts';

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

test('D6: a register asset fills the fixed-asset line with its UZS cost and depreciation', () => {
  const line = withRegisterAsset(
    { category: 'FIXED_ASSET', amount: 5, accumulatedDepreciation: 1, currency: 'USD', exchangeRate: 12500 },
    { id: 'fa-1', name: 'Stanok CNC', inventoryNumber: 'INV-7', initialCost: 1000000, accumulatedDepreciation: 400000 },
  );
  assert.equal(line.fixedAssetId, 'fa-1');
  assert.equal(line.amount, 1000000);
  assert.equal(line.accumulatedDepreciation, 400000);
  assert.equal(line.netAmount, 600000);
  assert.equal(line.currency, 'UZS', 'the register is kept in UZS');
  assert.equal(line.exchangeRate, 1);
  assert.equal(line.notes, 'Stanok CNC');
  assert.equal(line.contractNumber, 'INV-7');
});

test('D6: clearing the asset clears the link and the copied values', () => {
  const line = withRegisterAsset(
    { category: 'FIXED_ASSET', fixedAssetId: 'fa-1', amount: 1000000, accumulatedDepreciation: 400000, netAmount: 600000 },
    undefined,
  );
  assert.equal(line.fixedAssetId, null);
  assert.equal(line.amount, 0);
  assert.equal(line.accumulatedDepreciation, 0);
  assert.equal(line.netAmount, 0);
});
