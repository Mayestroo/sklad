import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateRecipeForm, materialUnitOptions, parseDecimal, type MaterialCard } from './production-recipe.ts';

const un: MaterialCard = { id: 'un', name: 'Un', type: 'RAW_MATERIAL', unitOfMeasure: 'kg', costPrice: 12000, costPriceCurrency: 'UZS' };
const yog: MaterialCard = {
  id: 'yog',
  name: "Yog'",
  type: 'RAW_MATERIAL',
  unitOfMeasure: 'box',
  units: [{ name: 'dona', factor: 1 / 12 }],
  costPrice: 144000,
  costPriceCurrency: 'UZS',
};
const shakar: MaterialCard = { id: 'shakar', name: 'Shakar', type: 'RAW_MATERIAL', unitOfMeasure: 'kg', costPrice: 10000, costPriceCurrency: 'UZS' };
const narxsiz: MaterialCard = { id: 'x', name: 'X', type: 'RAW_MATERIAL', unitOfMeasure: 'kg', costPrice: 0 };
const map = new Map([un, yog, shakar, narxsiz].map((m) => [m.id, m]));

test('A: 500 g of flour at 12 000 UZS/kg = 6 000 UZS', () => {
  const r = estimateRecipeForm([{ productId: 'un', quantity: '500', unit: 'g', lossPercent: '' }], map, '1');
  assert.equal(r.lines[0].total, 6000);
  assert.equal(r.perUnit, 6000);
});

test('E: 200 g with a 5% loss = 2 105,26 UZS (comma decimals accepted)', () => {
  const r = estimateRecipeForm([{ productId: 'shakar', quantity: '200', unit: 'g', lossPercent: '5' }], map, '1');
  assert.equal(r.lines[0].total, 2105.26);
  assert.equal(parseDecimal('0,2'), 0.2);
});

test('F: 3 dona of a 12-dona box = 36 000 UZS; the card unit is offered', () => {
  const r = estimateRecipeForm([{ productId: 'yog', quantity: '3', unit: 'dona', lossPercent: '0' }], map, '1');
  assert.equal(r.normTotal, 36000);
  assert.deepEqual(materialUnitOptions(yog).map((u) => u.code), ['box', 'dona']);
});

test('D: no price gives 0 and a warning flag, never a dash', () => {
  const r = estimateRecipeForm([{ productId: 'x', quantity: '1', unit: '', lossPercent: '' }], map, '1');
  assert.equal(r.normTotal, 0);
  assert.equal(r.missingPrice, true);
  assert.equal(r.info[0].hasPrice, false);
});

test('the norm divides the per-unit cost; an invalid loss does not count', () => {
  const r = estimateRecipeForm(
    [
      { productId: 'un', quantity: '2', unit: 'kg', lossPercent: '' },
      { productId: 'shakar', quantity: '1', unit: '', lossPercent: '120' },
    ],
    map,
    '4',
  );
  assert.equal(r.normTotal, 24000);
  assert.equal(r.perUnit, 6000);
  assert.equal(r.lines[1].total, null);
});
