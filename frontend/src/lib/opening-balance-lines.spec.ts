import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linesMissingCurrency, newOpeningBalanceLine, withProductCost, withRegisterAsset } from './opening-balance-lines.ts';

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

test('a new opening-balance line never guesses a currency (F8, ADR 0022)', async (t) => {
  for (const category of ['CASH', 'INVENTORY', 'CUSTOMER_DEBT', 'SUPPLIER_DEBT', 'CUSTOMER_ADVANCE'] as const) {
    await t.test(`${category} starts blank with no rate`, () => {
      const line = newOpeningBalanceLine(category);
      assert.equal(line.currency, '');
      assert.equal(line.exchangeRate, '');
      assert.equal(line.amount, 0);
    });
  }

  await t.test('equity and fixed assets are kept in the UZS base currency (no currency choice on those tables)', () => {
    assert.equal(newOpeningBalanceLine('EQUITY').currency, 'UZS');
    assert.equal(newOpeningBalanceLine('FIXED_ASSET').currency, 'UZS');
    assert.equal(newOpeningBalanceLine('EQUITY').exchangeRate, 1);
  });

  await t.test('linesMissingCurrency lists the 1-based rows that still need a currency', () => {
    assert.deepEqual(
      linesMissingCurrency([
        { category: 'CASH', currency: 'UZS' },
        { category: 'CUSTOMER_DEBT', currency: '' },
        { category: 'INVENTORY' },
        { category: 'EQUITY', currency: 'UZS' },
      ]),
      [2, 3],
    );
    assert.deepEqual(linesMissingCurrency([{ category: 'SUPPLIER_DEBT', currency: 'USD' }]), []);
  });
});
