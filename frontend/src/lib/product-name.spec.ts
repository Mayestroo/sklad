import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { editedProductName } from './product-name.ts';

describe('editedProductName', () => {
  it('replaces only the name in the user language', () => {
    assert.deepEqual(editedProductName({ uz: 'Un', ru: 'Мука' }, 'uz', 'Un (oliy nav)'), {
      uz: 'Un (oliy nav)',
      ru: 'Мука',
    });
    assert.deepEqual(editedProductName({ uz: 'Un', ru: 'Мука' }, 'ru', 'Мука в/с'), {
      uz: 'Un',
      ru: 'Мука в/с',
    });
  });

  it('uses the typed name for a missing other language', () => {
    assert.deepEqual(editedProductName({ uz: 'Un' }, 'uz', 'Un 2'), { uz: 'Un 2', ru: 'Un 2' });
    assert.deepEqual(editedProductName({ uz: 'Un', ru: '  ' }, 'uz', 'Un 2'), { uz: 'Un 2', ru: 'Un 2' });
  });

  it('treats a legacy string name as having no translation', () => {
    assert.deepEqual(editedProductName('Un', 'ru', 'Мука'), { uz: 'Мука', ru: 'Мука' });
    assert.deepEqual(editedProductName(null, 'uz', 'Un'), { uz: 'Un', ru: 'Un' });
  });
});
