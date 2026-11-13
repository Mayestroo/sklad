import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salesReturnHeaderFromInvoice } from './sales-return.ts';

test('a return inherits customer, warehouse and currency from its sales invoice', () => {
  const header = salesReturnHeaderFromInvoice({
    id: 'inv-1',
    counterpartyId: 'cust-1',
    warehouseId: 'wh-2',
    currency: 'USD',
  });

  assert.deepEqual(header, {
    invoiceId: 'inv-1',
    counterpartyId: 'cust-1',
    warehouseId: 'wh-2',
    currency: 'USD',
  });
});

test('refuses to guess a currency or warehouse the invoice does not carry (ADR 0022)', () => {
  assert.throws(
    () =>
      salesReturnHeaderFromInvoice({
        id: 'inv-1',
        counterpartyId: 'cust-1',
        warehouseId: 'wh-1',
        currency: '',
      }),
    /currency/,
  );
  assert.throws(
    () =>
      salesReturnHeaderFromInvoice({
        id: 'inv-1',
        counterpartyId: 'cust-1',
        warehouseId: '',
        currency: 'UZS',
      }),
    /warehouse/,
  );
});
