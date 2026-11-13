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
