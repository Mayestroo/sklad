import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totalsByCurrency } from './currency-totals.ts';

const rows = [
  { currency: 'UZS', total: '1000000' },
  { currency: 'USD', total: 100.1 },
  { currency: 'UZS', total: 250000 },
  { currency: 'USD', total: 0.2 },
];

test('keeps one total per currency, never summed across currencies', () => {
  assert.deepEqual(
    totalsByCurrency(rows, (r) => r.currency, (r) => r.total),
    [
      { currency: 'USD', amount: 100.3 },
      { currency: 'UZS', amount: 1_250_000 },
    ],
  );
});

test('no rows → no totals', () => {
  assert.deepEqual(totalsByCurrency([], () => 'UZS', () => 1), []);
});

test('a row without a currency fails instead of being guessed', () => {
  assert.throws(() => totalsByCurrency([{ c: null }], (r) => r.c, () => 1), TypeError);
  assert.throws(() => totalsByCurrency([{ c: '' }], (r) => r.c, () => 1), TypeError);
});
