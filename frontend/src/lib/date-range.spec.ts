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

test('quick periods use the local calendar date, weeks start on Monday', async () => {
  const { quickPeriodRange, localIsoDate } = await import('./date-range.ts');
  // Saturday 21 Nov 2026, 00:20 local time
  const now = new Date(2026, 10, 21, 0, 20);
  assert.equal(localIsoDate(now), '2026-11-21');
  assert.deepEqual(quickPeriodRange('today', now), { date_from: '2026-11-21', date_to: '2026-11-21' });
  assert.deepEqual(quickPeriodRange('yesterday', now), { date_from: '2026-11-20', date_to: '2026-11-20' });
  assert.deepEqual(quickPeriodRange('this_week', now), { date_from: '2026-11-16', date_to: '2026-11-21' });
  assert.deepEqual(quickPeriodRange('last_week', now), { date_from: '2026-11-09', date_to: '2026-11-15' });
  assert.deepEqual(quickPeriodRange('this_month', now), { date_from: '2026-11-01', date_to: '2026-11-21' });
  assert.deepEqual(quickPeriodRange('last_month', now), { date_from: '2026-10-01', date_to: '2026-10-31' });
  assert.deepEqual(quickPeriodRange('this_quarter', now), { date_from: '2026-10-01', date_to: '2026-11-21' });
  assert.deepEqual(quickPeriodRange('this_year', now), { date_from: '2026-01-01', date_to: '2026-11-21' });
  // Sunday belongs to the week that started on Monday
  assert.deepEqual(quickPeriodRange('this_week', new Date(2026, 10, 22, 12)), { date_from: '2026-11-16', date_to: '2026-11-22' });
});
