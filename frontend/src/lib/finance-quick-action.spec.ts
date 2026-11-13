import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { financeQuickAction, SALES_EXPENSE_HREF } from './finance-quick-action.ts';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('financeQuickAction (B13)', () => {
  test('accepts only the three drawer modes', () => {
    assert.equal(financeQuickAction('expense'), 'expense');
    assert.equal(financeQuickAction('income'), 'income');
    assert.equal(financeQuickAction('transfer'), 'transfer');
    for (const value of [null, undefined, '', 'EXPENSE', 'exchange', 'x']) {
      assert.equal(financeQuickAction(value), null);
    }
  });

  test('the sales expense link opens a new finance expense', () => {
    const url = new URL(SALES_EXPENSE_HREF, 'http://x');
    assert.equal(url.pathname, '/finance');
    assert.equal(financeQuickAction(url.searchParams.get('new')), 'expense');
  });
});

/** No DOM test runner in this project: the wiring is checked in the source. */
describe('B13 wiring', () => {
  test('the Sales menu has a selling-expense entry pointing to finance, not to purchase landed cost', () => {
    const sidebar = read('../components/layout/Sidebar.tsx');
    const sales = sidebar.slice(sidebar.indexOf('const salesSubItems'), sidebar.indexOf('const settingsSubItems'));
    assert.match(sales, /href: SALES_EXPENSE_HREF, label: t\('salesExpenses'\)/);
    assert.doesNotMatch(sales, /purchases\/expenses/);
  });

  test('the finance page opens the drawer named by ?new=', () => {
    const page = read('../app/[locale]/(dashboard)/finance/page.tsx');
    assert.match(page, /financeQuickAction\(searchParams\.get\('new'\)\)/);
  });

  test('the menu label exists in both languages', () => {
    for (const file of ['../../messages/uz.json', '../../messages/ru.json']) {
      const messages = JSON.parse(read(file)) as { nav?: Record<string, string> };
      const label = messages.nav?.salesExpenses;
      assert.ok(label && label.length > 0, `${file}: nav.salesExpenses missing`);
    }
  });
});
