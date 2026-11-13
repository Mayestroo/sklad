import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getLocalizedName } from './utils.ts';

describe('getLocalizedName', () => {
  test('turns a company name stored as { uz, ru } JSON into display text', () => {
    // Company.name is JSON; rendering it raw would make React throw.
    const name = { uz: 'Javox MChJ', ru: 'ООО Джавокс' };
    assert.strictEqual(getLocalizedName(name, 'uz'), 'Javox MChJ');
    assert.strictEqual(getLocalizedName(name, 'ru'), 'ООО Джавокс');
  });

  test('passes plain strings through and shows a dash for an empty name', () => {
    assert.strictEqual(getLocalizedName('Plain', 'uz'), 'Plain');
    assert.strictEqual(getLocalizedName(null, 'uz'), '—');
  });
});
