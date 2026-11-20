import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  getInitialActiveOptionIndex,
  getNextActiveOptionIndex,
  scrollTopForRow,
  virtualWindow,
} from './select-keyboard.ts';

describe('select keyboard navigation', () => {
  test('starts on a valid selected item', () => {
    assert.equal(getInitialActiveOptionIndex(2, 4), 2);
  });

  test('falls back to the first item when there is no valid selection', () => {
    assert.equal(getInitialActiveOptionIndex(-1, 3), 0);
    assert.equal(getInitialActiveOptionIndex(5, 3), 0);
  });

  test('returns -1 when there are no options', () => {
    assert.equal(getInitialActiveOptionIndex(-1, 0), -1);
    assert.equal(getNextActiveOptionIndex(0, 1, 0), -1);
  });

  test('moves one item and clamps at either end', () => {
    assert.equal(getNextActiveOptionIndex(1, 1, 4), 2);
    assert.equal(getNextActiveOptionIndex(0, -1, 4), 0);
    assert.equal(getNextActiveOptionIndex(3, 1, 4), 3);
  });
});

describe('virtual scroll of long lists', () => {
  test('renders only the rows in view, with a small overscan', () => {
    assert.deepEqual(virtualWindow(0, 220, 52, 1000), { start: 0, end: 9 });
    assert.deepEqual(virtualWindow(5200, 220, 52, 1000), { start: 96, end: 109 });
    assert.deepEqual(virtualWindow(51900, 220, 52, 1000), { start: 994, end: 1000 });
    assert.deepEqual(virtualWindow(0, 220, 52, 0), { start: 0, end: 0 });
  });

  test('keyboard moves keep the active row visible', () => {
    assert.equal(scrollTopForRow(10, 0, 220, 52), 52 * 11 - 220);
    assert.equal(scrollTopForRow(2, 520, 220, 52), 104);
    assert.equal(scrollTopForRow(3, 100, 220, 52), 100);
  });
});
