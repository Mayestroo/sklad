import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillCashFlowSeries } from './cash-flow-series.ts';

test('fills every day of the period with zero buckets', () => {
  const out = fillCashFlowSeries([{ period: '2026-11-03', income: 5, expense: 1 }], 'day', '2026-11-01', '2026-11-04');
  assert.deepEqual(out.map((b) => b.period), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
  assert.deepEqual(out[2], { period: '2026-11-03', income: 5, expense: 1 });
  assert.deepEqual(out[0], { period: '2026-11-01', income: 0, expense: 0 });
});

test('fills months across a year boundary', () => {
  const out = fillCashFlowSeries([], 'month', '2025-11-15', '2026-02-01');
  assert.deepEqual(out.map((b) => b.period), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('keeps weekly series and movement outside the range as they are', () => {
  const weekly = [{ period: '2026-11-01', income: 1, expense: 0 }];
  assert.equal(fillCashFlowSeries(weekly, 'week', '2026-11-01', '2026-11-30'), weekly);
  const out = fillCashFlowSeries([{ period: '2026-10-31', income: 2, expense: 0 }], 'day', '2026-11-01', '2026-11-02');
  assert.deepEqual(out.map((b) => b.period), ['2026-10-31', '2026-11-01', '2026-11-02']);
});

test('does not expand very long day ranges', () => {
  const series = [{ period: '2026-06-01', income: 1, expense: 0 }];
  assert.equal(fillCashFlowSeries(series, 'day', '2026-01-01', '2026-12-31'), series);
});
