import test from 'node:test';
import assert from 'node:assert/strict';
import { activeKeys, addDays, customPeriod, filtersFromQuery, formatPeriodRange, isPeriodValue, monthGrid, periodRange, queryWithFilters } from './list-filters.ts';

const now = new Date(2026, 10, 21, 10, 0, 0); // Sat 21 Nov 2026

test('period presets give the same ranges as before (weeks start Monday)', () => {
  assert.deepEqual(periodRange('', now), { from: '', to: '' });
  assert.deepEqual(periodRange('today', now), { from: '2026-11-21', to: '2026-11-21' });
  assert.deepEqual(periodRange('yesterday', now), { from: '2026-11-20', to: '2026-11-20' });
  assert.deepEqual(periodRange('this_week', now), { from: '2026-11-16', to: '2026-11-21' });
  assert.deepEqual(periodRange('this_month', now), { from: '2026-11-01', to: '2026-11-21' });
  assert.deepEqual(periodRange('last_month', now), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(periodRange('this_year', now), { from: '2026-01-01', to: '2026-11-21' });
});

test('custom range: one string, ordered, either end optional', () => {
  assert.equal(customPeriod('2026-11-10', '2026-11-01'), '2026-11-01_2026-11-10');
  assert.equal(customPeriod('', ''), '');
  assert.deepEqual(periodRange('2026-11-01_2026-11-10'), { from: '2026-11-01', to: '2026-11-10' });
  assert.deepEqual(periodRange('2026-11-01_'), { from: '2026-11-01', to: '' });
  assert.equal(formatPeriodRange('2026-11-01_2026-11-10'), '01.11.2026 – 10.11.2026');
  assert.equal(formatPeriodRange('2026-11-05_2026-11-05'), '05.11.2026');
  assert.equal(isPeriodValue('2026-11-01_2026-11-10'), true);
  assert.equal(isPeriodValue('garbage'), false);
  assert.deepEqual(periodRange('garbage'), { from: '', to: '' });
});

test('URL names a filter → it describes the whole view; none named → null (remembered view applies)', () => {
  const defaults = { status: '', paymentStatus: '', period: '' };
  assert.equal(filtersFromQuery('?edit=1', defaults), null);
  assert.deepEqual(filtersFromQuery('?status=DRAFT', defaults), { values: { status: 'DRAFT', paymentStatus: '', period: '' }, search: '' });
  assert.deepEqual(filtersFromQuery('?q=INV-9', defaults), { values: defaults, search: 'INV-9' });
});

test('query keeps foreign params, drops defaults, writes "all" for a non-empty default', () => {
  const defaults = { status: '', archived: 'active' };
  assert.equal(queryWithFilters('?tab=x&status=OLD', { status: 'POSTED', archived: 'active' }, defaults, 'abc'), '?tab=x&status=POSTED&q=abc');
  assert.equal(queryWithFilters('', { status: '', archived: '' }, defaults, ''), '?archived=');
  assert.equal(queryWithFilters('?status=X', defaults, defaults, ''), '');
  assert.deepEqual(activeKeys({ status: 'POSTED', archived: 'active' }, defaults), ['status']);
});

test('calendar grid starts Monday', () => {
  const nov = monthGrid(2026, 10); // 1 Nov 2026 is a Sunday → 6 blanks
  assert.equal(nov.slice(0, 6).every((c) => c === null), true);
  assert.equal(nov[6], '2026-11-01');
  assert.equal(nov.length, 6 + 30);
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});
