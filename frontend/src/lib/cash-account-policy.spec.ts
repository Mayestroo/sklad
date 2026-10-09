import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  isCashAccountCompatibleWithSalesPayment,
  isCashAccountCurrencyValid,
  requiredAccountTypeForSalesPayment,
} from './cash-account-policy.ts';

describe('cash account isolation policy', () => {
  test('keeps UZS and USD cash tills fixed to their native currency', () => {
    assert.strictEqual(isCashAccountCurrencyValid({ accountType: 'UZS_CASH', currency: 'UZS' }), true);
    assert.strictEqual(isCashAccountCurrencyValid({ accountType: 'UZS_CASH', currency: 'USD' }), false);
    assert.strictEqual(isCashAccountCurrencyValid({ accountType: 'USD_CASH', currency: 'USD' }), true);
    assert.strictEqual(isCashAccountCurrencyValid({ accountType: 'USD_CASH', currency: 'UZS' }), false);
  });

  test('keeps a bank account separate while preserving its configured currency', () => {
    assert.strictEqual(isCashAccountCurrencyValid({ accountType: 'BANK', currency: 'UZS' }), true);
    assert.strictEqual(isCashAccountCurrencyValid({ accountType: 'BANK', currency: 'USD' }), true);
    assert.strictEqual(isCashAccountCurrencyValid({ accountType: 'BANK', currency: 'EUR' }), false);
  });

  test('routes cash receipts to the matching-currency till and other methods to bank', () => {
    assert.strictEqual(isCashAccountCompatibleWithSalesPayment({ accountType: 'USD_CASH', currency: 'USD' }, 'CASH', 'USD'), true);
    assert.strictEqual(isCashAccountCompatibleWithSalesPayment({ accountType: 'UZS_CASH', currency: 'UZS' }, 'CASH', 'UZS'), true);
    assert.strictEqual(isCashAccountCompatibleWithSalesPayment({ accountType: 'BANK', currency: 'USD' }, 'CASH', 'USD'), false);
    assert.strictEqual(isCashAccountCompatibleWithSalesPayment({ accountType: 'UZS_CASH', currency: 'UZS' }, 'BANK_TRANSFER', 'UZS'), false);
    assert.strictEqual(isCashAccountCompatibleWithSalesPayment({ accountType: 'BANK', currency: 'UZS' }, 'BANK_TRANSFER', 'UZS'), true);
    assert.strictEqual(requiredAccountTypeForSalesPayment('CASH', 'EUR'), null);
    assert.strictEqual(isCashAccountCompatibleWithSalesPayment({ accountType: 'UZS_CASH', currency: 'UZS' }, 'CASH', 'EUR'), false);
  });
});
