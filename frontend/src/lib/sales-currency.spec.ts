import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initialDocumentCurrency, salesDefaultCurrency } from './sales-currency.ts';

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

describe('initialDocumentCurrency', () => {
  it('keeps the saved document currency', () => {
    assert.equal(initialDocumentCurrency('UZS', 'USD'), 'UZS');
  });

  it('starts a new document in the tenant sales default', () => {
    assert.equal(initialDocumentCurrency(undefined, 'USD'), 'USD');
    assert.equal(initialDocumentCurrency(null, 'UZS'), 'UZS');
  });

  it('starts blank, never USD, without a saved currency or a sales default', () => {
    assert.equal(initialDocumentCurrency(undefined, null), '');
  });
});
