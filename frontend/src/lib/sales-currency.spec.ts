import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { salesDefaultCurrency } from './sales-currency.ts';

describe('salesDefaultCurrency', () => {
  it('returns the supported sales default', () => {
    assert.equal(salesDefaultCurrency({ sales: { defaultCurrency: 'USD' } }), 'USD');
    assert.equal(salesDefaultCurrency({ sales: { defaultCurrency: 'UZS' } }), 'UZS');
  });

  it('returns null instead of guessing when the default is missing or unsupported', () => {
    assert.equal(salesDefaultCurrency(null), null);
    assert.equal(salesDefaultCurrency({}), null);
    assert.equal(salesDefaultCurrency({ sales: {} }), null);
    assert.equal(salesDefaultCurrency({ sales: { defaultCurrency: 'EUR' } }), null);
    assert.equal(salesDefaultCurrency({ sales: { defaultCurrency: '' } }), null);
  });

  it('ignores other settings sections (no accounting/currency fallback)', () => {
    assert.equal(salesDefaultCurrency({ accounting: { defaultCurrency: 'USD' }, currency: 'USD' }), null);
  });
});
