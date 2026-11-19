import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitLabel } from './units.ts';
import { formatQuantity as formatted } from '../../../shared/format/money.ts';

test('stored unit codes are shown in the user language, never in English', () => {
  assert.equal(unitLabel('piece', 'uz'), 'dona');
  assert.equal(unitLabel('meter', 'uz'), 'metr');
  assert.equal(unitLabel('piece', 'ru'), 'шт');
  assert.equal(unitLabel('meter', 'ru'), 'м');
  assert.equal(unitLabel('liter', 'uz'), 'litr');
});

test('custom units are shown as typed; a missing unit reads as pieces', () => {
  assert.equal(unitLabel('rulon', 'uz'), 'rulon');
  assert.equal(unitLabel(null, 'uz'), 'dona');
  assert.equal(unitLabel(undefined, 'ru'), 'шт');
});

test('a quantity is shown with its unit; no unit shows the number alone', async () => {
  const { quantityWithUnit } = await import('./units.ts');
  assert.equal(quantityWithUnit(1250.5, 'kg', 'uz'), `${formatted(1250.5)} kg`);
  assert.equal(quantityWithUnit(3, 'piece', 'ru'), `${formatted(3)} шт`);
  assert.equal(quantityWithUnit(2, null, 'uz'), formatted(2));
});
