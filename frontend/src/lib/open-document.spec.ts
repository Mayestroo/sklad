import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { amountForPickedDocument, remainingOnDocument } from './open-document.ts';

test('the remaining debt of a document, in cents', () => {
  assert.equal(remainingOnDocument({ totalAmount: '58.24', paidAmount: '0' }), 58.24);
  assert.equal(remainingOnDocument({ totalAmount: 100, paidAmount: 33.33 }), 66.67);
  assert.equal(remainingOnDocument({ totalAmount: 10, paidAmount: 10 }), 0);
  assert.equal(remainingOnDocument({ totalAmount: 10, paidAmount: 12 }), 0, 'never negative');
});

test('picking a document fills the amount with what is owed on it', () => {
  assert.equal(amountForPickedDocument({ totalAmount: '58.24', paidAmount: '0' }), '58.24');
  assert.equal(amountForPickedDocument({ totalAmount: 50, paidAmount: 20 }), '30');
  assert.equal(amountForPickedDocument({ totalAmount: 10, paidAmount: 10 }), '');
  assert.equal(amountForPickedDocument(undefined), '');
});

test('the Finance form sets the amount when a sales invoice or receipt is picked', () => {
  const page = readFileSync(
    fileURLToPath(new URL('../app/[locale]/(dashboard)/finance/page.tsx', import.meta.url)),
    'utf8',
  );
  assert.match(page, /setAmount\(amountForPickedDocument\(selectedDocument\)\)/);
});
