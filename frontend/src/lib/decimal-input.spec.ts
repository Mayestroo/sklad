import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caretAfterSignificant, formatDecimalText, sanitizeDecimalText } from './decimal-input.ts';

const NBSP = ' ';

test('thousands are grouped with a space, decimals use a comma', () => {
  assert.equal(formatDecimalText('1234567.5'), `1${NBSP}234${NBSP}567,5`);
  assert.equal(formatDecimalText(144000), `144${NBSP}000`);
  assert.equal(formatDecimalText(''), '');
});

test('typing: a dot becomes a comma, the value stays canonical', () => {
  assert.deepEqual(sanitizeDecimalText('1234.5'), { text: `1${NBSP}234,5`, value: '1234.5' });
  assert.deepEqual(sanitizeDecimalText('0,25'), { text: '0,25', value: '0.25' });
  assert.deepEqual(sanitizeDecimalText('12,'), { text: '12,', value: '12' });
});

test('a minus sign or letters cannot be typed; decimals are capped', () => {
  assert.deepEqual(sanitizeDecimalText('-50'), { text: '50', value: '50' });
  assert.deepEqual(sanitizeDecimalText('1,23456', 3), { text: '1,234', value: '1.234' });
  assert.deepEqual(sanitizeDecimalText('5,5', 0), { text: '55', value: '55' });
  assert.deepEqual(sanitizeDecimalText('abc'), { text: '', value: '' });
});

test('the caret stays after the same digit when spaces are added', () => {
  const text = `1${NBSP}234`;
  assert.equal(caretAfterSignificant(text, 2), 3);
  assert.equal(caretAfterSignificant(text, 4), text.length);
});
