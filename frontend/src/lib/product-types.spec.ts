import test from 'node:test';
import assert from 'node:assert/strict';
import { isPurchasable, isSellable, productTypeLabel, productTypeOptions } from './product-types.ts';

test('the four nomenclature types of TZ 3.1, in both languages', () => {
  assert.deepEqual(
    productTypeOptions('uz').map((o) => o.label),
    ['Tovar', 'Xomashyo', 'Tayyor mahsulot', 'Xizmat'],
  );
  assert.equal(productTypeLabel('FINISHED_PRODUCT', 'ru'), 'Готовый продукт');
  assert.equal(productTypeOptions('uz', 'Barcha')[0].value, '');
});

test('a finished product is never purchasable', () => {
  assert.equal(isPurchasable({ type: 'FINISHED_PRODUCT' }), false);
  assert.equal(isPurchasable({ type: 'RAW_MATERIAL' }), true);
  assert.equal(isPurchasable({ type: 'PRODUCT' }), true);
});

test('a semi-finished product is sold only with a sale price', () => {
  assert.equal(isSellable({ type: 'FINISHED_PRODUCT', isSemiFinished: true, salePrice: 0 }), false);
  assert.equal(isSellable({ type: 'FINISHED_PRODUCT', isSemiFinished: true, salePrice: 5000 }), true);
  assert.equal(isSellable({ type: 'FINISHED_PRODUCT', isSemiFinished: false, salePrice: 0 }), true);
});
