import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * muammolar.pdf B10 ("Nomenklatura edit qilish kerak"): the nomenclature
 * list had no way to edit a product. No DOM test runner exists here, so this
 * checks the page wires an edit action, gated by the product edit permission,
 * to the shared product drawer.
 */
const page = readFileSync(fileURLToPath(new URL('../../app/[locale]/(dashboard)/inventory/page.tsx', import.meta.url)), 'utf8');

test('each product row can be opened in the product drawer for editing', () => {
  assert.match(page, /hasPermission\('inventory:edit'\)/);
  assert.match(page, /onClick=\{\(\) => setEditingProduct\(product\)\}/);
  assert.match(page, /<CreateProductDrawer[\s\S]*?productToEdit=\{editingProduct\}/);
});

const documentsPage = readFileSync(
  fileURLToPath(new URL('../../app/[locale]/(dashboard)/inventory/documents/page.tsx', import.meta.url)),
  'utf8',
);

test('inventory document amounts are shown in UZS, the currency of batch cost', () => {
  // Inventory documents have no currency column: unit prices become FIFO
  // batch cost, which is UZS (CLAUDE.md), so the tenant default currency
  // (possibly USD) must not label them.
  assert.doesNotMatch(documentsPage, /defaultCurrency/);
  assert.match(documentsPage, /INVENTORY_COST_CURRENCY = 'UZS'/);
});

