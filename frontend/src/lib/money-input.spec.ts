import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoneyInput, formatMoneyInput } from './money-input.ts';

const S = ' '; // group separator shown in the field (same as shared/format/money.ts)
const p = (raw: string, dec = 3, amb?: 'decimal' | 'grouped') => parseMoneyInput(raw, dec, amb);

test('the brief example: typed "15,000.5" is 15000.5 and shows as "15 000,5"', () => {
  assert.deepEqual(p('15,000.5', 2), { text: `15${S}000,5`, value: 15000.5, reading: 'decimal' });
});

test('both separators: the last one is the decimal (English and Russian habits)', () => {
  assert.equal(p('15.000,5', 2).value, 15000.5);
  assert.equal(p('1,234,567.89', 2).value, 1234567.89);
  assert.equal(p('1.234.567,89', 2).value, 1234567.89);
});

test('spaces of any kind are groups', () => {
  assert.equal(p('15 000', 2).value, 15000);
  assert.equal(p(`15${S}000,5`, 2).value, 15000.5);
  assert.equal(p('15 000', 2).value, 15000);
  assert.equal(p('1 234 567,8', 2).text, `1${S}234${S}567,8`);
});

test('the field text it produces reads back to the same number (editing never shifts the value)', () => {
  for (const n of [0, 1, 12.5, 999, 1000, 15000.5, 1234567.89, 0.125]) {
    const text = formatMoneyInput(n, 3);
    assert.equal(p(text, 3).value, n, `${n} → "${text}"`);
  }
  // the old bug: "15,000" shown for 15000, one 0 deleted → read as 15. Now the field shows "15 000".
  assert.equal(p(`15${S}00`, 3).value, 1500);
});

test('a single separator is the decimal', () => {
  assert.deepEqual(p('1,5'), { text: '1,5', value: 1.5, reading: 'decimal' });
  assert.equal(p('12.75', 2).value, 12.75);
  assert.equal(p('0,0001', 3).value, 0); // truncated to 3 decimals: 0,000
  assert.equal(p('0,0001', 3).text, '0,000');
});

test('a trailing separator is kept while typing', () => {
  assert.deepEqual(p('15,', 2), { text: '15,', value: 15, reading: 'decimal' });
  assert.deepEqual(p('15.', 2), { text: '15,', value: 15, reading: 'decimal' });
  assert.deepEqual(p(',', 2), { text: '0,', value: 0, reading: 'decimal' });
});

test('ambiguous: one separator + exactly three digits, in a field with 3+ decimals', () => {
  assert.deepEqual(p('15,000', 3), { text: '15,000', value: 15, reading: 'ambiguous' });
  assert.deepEqual(p('15,000', 3, 'grouped'), { text: `15${S}000`, value: 15000, reading: 'ambiguous' });
  assert.equal(p('1.500', 3, 'grouped').value, 1500);
  assert.equal(p('1.500', 3).value, 1.5);
  // no digits before it: ",500" is 0,500 (not a thousands group)
  assert.equal(p(',500', 3).reading, 'decimal');
});

test('not ambiguous where three decimals are impossible', () => {
  assert.deepEqual(p('15,000', 2), { text: `15${S}000`, value: 15000, reading: 'grouped' });
  assert.deepEqual(p('1.500', 0), { text: `1${S}500`, value: 1500, reading: 'grouped' });
  assert.equal(p('12,5', 0).value, 125); // whole-number field: separators are groups
});

test('repeated separator: groups, unless the last group is not three digits', () => {
  assert.equal(p('1,000,000', 3).value, 1000000);
  assert.equal(p('1.000.000', 3).reading, 'grouped');
  assert.equal(p('1,000,5', 3).value, 1000.5);
});

test('decimals beyond the field are cut, letters and signs are ignored, empty stays empty', () => {
  assert.equal(p('2,1234', 3).value, 2.123);
  assert.equal(p('1,25', 1).value, 1.2);
  assert.equal(p('abc12x', 2).value, 12);
  assert.equal(p('-5', 2).value, 5);
  assert.deepEqual(p('', 2), { text: '', value: null, reading: 'plain' });
  assert.deepEqual(p('   ', 2), { text: '', value: null, reading: 'plain' });
  assert.equal(p('007', 2).text, '7');
});

test('stored numbers are shown without trailing zeros (D9: 1, not 1,000)', () => {
  assert.equal(formatMoneyInput(1, 3), '1');
  assert.equal(formatMoneyInput(1000, 3), `1${S}000`);
  assert.equal(formatMoneyInput(1.5, 3), '1,5');
  assert.equal(formatMoneyInput(2.1234, 3), '2,123');
  assert.equal(formatMoneyInput('15000.50', 2), `15${S}000,5`); // API decimal strings
  assert.equal(formatMoneyInput('', 2), '');
  assert.equal(formatMoneyInput(null, 2), '');
  assert.equal(formatMoneyInput('abc', 2), '0');
  assert.equal(formatMoneyInput(0, 2), '0');
});
