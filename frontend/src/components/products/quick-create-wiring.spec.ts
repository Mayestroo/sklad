import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * muammolar.pdf B1, B4, B5, B9. No DOM test runner exists in this project, so
 * these check the page sources: the product and counterparty dropdowns offer
 * "create new" and open the shared drawers, and opening-balance amounts use
 * CurrencyInput (thousands separated with commas) instead of number inputs.
 */
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const openingBalances = read('../../app/[locale]/(dashboard)/opening-balances/page.tsx');
const salesInvoice = read('../sales/SalesInvoiceForm.tsx');

test('B1: opening-balance product dropdown can create a product', () => {
  assert.match(openingBalances, /onCreateNew=\{!isReadOnly \? \(\) => onCreateProduct\(index\) : undefined\}/);
  assert.match(openingBalances, /<CreateProductDrawer/);
});

test('B4: opening-balance counterparty dropdowns can create a counterparty', () => {
  const hooks = openingBalances.match(/onCreateNew=\{!isReadOnly \? \(\) => onCreateCounterparty\(index\) : undefined\}/g) ?? [];
  assert.equal(hooks.length, 2, 'debts and advances tables');
  assert.match(openingBalances, /<CreateCounterpartyDrawer/);
});

test('B5: opening-balance amounts are entered with thousands separators', () => {
  assert.doesNotMatch(openingBalances, /parseFloat\(e\.target\.value\)/);
  assert.equal((openingBalances.match(/<CurrencyInput/g) ?? []).length, 8);
});

test('B9: sales invoice product dropdown can create a product', () => {
  assert.match(salesInvoice, /onCreateNew=\{!isReadOnly \? \(\) => setQuickProductRow\(idx\) : undefined\}/);
  assert.match(salesInvoice, /<CreateProductDrawer/);
});

test('B2: inventory opening lines carry their own cost currency and rate', () => {
  const inventoryTable = openingBalances.slice(openingBalances.indexOf('function InventoryTable('), openingBalances.indexOf('function CounterpartyTable('));
  assert.match(inventoryTable, /onUpdate\(index, 'currency', value\)/);
  assert.match(inventoryTable, /onUpdate\(index, 'exchangeRate', event\.target\.value\)/);
  // F8: a line without a currency shows a dash, never a UZS label.
  assert.match(inventoryTable, /formatCurrencyIfAvailable\(Number\(line\.amount \|\| 0\), locale, line\.currency\) \?\? '—'/);
  assert.doesNotMatch(inventoryTable, /currency \|\| '(USD|UZS)'/);
});
