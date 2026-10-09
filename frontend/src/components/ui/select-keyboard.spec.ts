import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  getInitialActiveOptionIndex,
  getNextActiveOptionIndex,
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
