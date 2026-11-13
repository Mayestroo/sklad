import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stockLabel } from './stock-label.ts';

test('shows the free stock of the document warehouse', () => {
  assert.equal(stockLabel(1, 1, 'uz'), 'Qoldiq: 1');
  assert.equal(stockLabel(0, 0, 'uz'), 'Qoldiq: 0');
});

test('says when other warehouses hold stock the selected one does not', () => {
  assert.equal(stockLabel(0, 5, 'uz'), 'Qoldiq: 0 (barcha omborlarda: 5)');
  assert.equal(stockLabel(undefined, 2, 'ru'), 'Свободно: 0 (всего по складам: 2)');
});
