import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDmy, formatRange, maskDmy, orderedRange, parseDmy } from './date-range.ts';

test('dates read as dd.MM.yyyy, never mm/dd/yyyy', () => {
  assert.equal(formatDmy('2026-11-20'), '20.11.2026');
  assert.equal(formatDmy('2026-11-20T10:00:00.000Z'), '20.11.2026');
  assert.equal(formatDmy(''), '');
});

test('typed dates are parsed day first and checked', () => {
  assert.equal(parseDmy('20.11.2026'), '2026-11-20');
  assert.equal(parseDmy('5/3/2026'), '2026-03-05');
  assert.equal(parseDmy('31.02.2026'), null);
  assert.equal(parseDmy('11/20/2026'), null, 'month 20 does not exist');
});

test('typing digits adds the dots', () => {
  assert.equal(maskDmy('2011'), '20.11');
  assert.equal(maskDmy('20112026'), '20.11.2026');
  assert.equal(maskDmy('20.11.20267'), '20.11.2026');
});

test('one range field shows both ends and keeps them in order', () => {
  assert.equal(formatRange('2026-11-01', '2026-11-30'), '01.11.2026 – 30.11.2026');
  assert.equal(formatRange('', ''), '');
  assert.deepEqual(orderedRange('2026-11-30', '2026-11-01'), ['2026-11-01', '2026-11-30']);
});
