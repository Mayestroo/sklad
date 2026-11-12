import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCounterpartyPayload } from './counterparty-form.ts';

const base = {
  name: ' Baosdy Co ',
  type: 'SUPPLIER' as const,
  folderId: '',
  discountPercent: '',
  inn: '123456789',
  phone: '',
  email: '  ',
  address: 'Toshkent',
  bankName: '',
  bankAccount: '',
  mfo: '',
};

test('an emptied contact field is sent as null so the server clears it', () => {
  const payload = buildCounterpartyPayload(base);
  assert.equal(payload.phone, null);
  assert.equal(payload.email, null);
  assert.equal(payload.bankName, null);
});

test('filled fields are trimmed and kept', () => {
  const payload = buildCounterpartyPayload(base);
  assert.equal(payload.name, 'Baosdy Co');
  assert.equal(payload.inn, '123456789');
  assert.equal(payload.address, 'Toshkent');
  assert.equal(payload.folderId, null);
  assert.equal(payload.discountPercent, 0);
});
