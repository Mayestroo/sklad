import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * muammolar.pdf B5: money is typed with thousands separators. These forms
 * enter money and must use MoneyInput/CurrencyInput, not a bare number input
 * that shows "1000000". Exchange rates and percentages stay plain inputs.
 */
const MONEY_FORMS: Array<[string, number]> = [
  ['components/counterparties/QuickPaymentModal.tsx', 1],
  ['components/sales/PaySalesInvoiceModal.tsx', 1],
  ['components/sales/PaySalesOrderModal.tsx', 1],
  ['components/purchases/PayPurchaseModal.tsx', 1],
  ['components/services/ServiceActDetailsModal.tsx', 1],
  ['components/services/ServiceActDrawer.tsx', 1],
  ['components/products/CreateProductDrawer.tsx', 2],
  ['components/purchases/QuickAddProductModal.tsx', 2],
  ['components/sales/SalesInvoiceForm.tsx', 1],
  ['components/sales/SalesOrderForm.tsx', 1],
  ['app/[locale]/(dashboard)/products/new/page.tsx', 2],
  ['app/[locale]/(dashboard)/finance/page.tsx', 2],
  ['app/[locale]/(dashboard)/sales/crm/page.tsx', 2],
  ['app/[locale]/(dashboard)/purchases/expenses/new/page.tsx', 1],
  ['app/[locale]/(dashboard)/inventory/documents/page.tsx', 1],
];

for (const [file, count] of MONEY_FORMS) {
  test(`${file} enters money with separators`, () => {
    const source = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
    const found = (source.match(/<MoneyInput\b/g) ?? []).length;
    assert.ok(found >= count, `expected at least ${count} MoneyInput, found ${found}`);
  });
}
