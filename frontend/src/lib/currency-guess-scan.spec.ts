import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * F8 / ADR 0022: no silent currency guess. A form, price, payment or stored
 * amount never takes a guessed currency (`x || 'UZS'`, `useState('USD')`,
 * `useDefaultCurrency()`); it starts blank and refuses to submit until one is
 * chosen. This scan fails when a new guess appears.
 *
 * The cases below are display-only and were left on purpose (docs/progress.md,
 * round 5, F8 table). Each entry is the number of matches allowed in that file
 * for that pattern; adding one more fails the scan.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));
const SCANNED_DIRS = ['app', 'components', 'hooks', 'lib', 'context'];

const PATTERNS: Record<string, RegExp> = {
  literal: /(\|\||\?\?)\s*['"](USD|UZS|EUR|RUB)['"]/,
  state: /useState(<[^>]*>)?\(\s*['"](USD|UZS|EUR|RUB)['"]\s*\)/,
  hook: /useDefaultCurrency\(/,
  objectDefault: /\b[cC]urrency\s*[:=]\s*['"](USD|UZS|EUR|RUB)['"]/,
};

const D = 'app/[locale]/(dashboard)/';
const NEVER_EMPTY = 'display only; the field is a NOT NULL column (or always set by the API), so the fallback never shows';
const ZERO = 'display only; fallback label of a zero amount when there is no row in any currency (MultiCurrencyValue)';
const F10 = 'display only; finding F10 (cross-currency total labelled with one currency, ADR 0023), not a stored value';

const ALLOWED: Array<{ file: string; pattern: keyof typeof PATTERNS; count: number; reason: string }> = [
  { file: 'hooks/useDefaultCurrency.ts', pattern: 'hook', count: 1, reason: 'the display-only hook itself (its definition)' },
  { file: `${D}accounting/page.tsx`, pattern: 'literal', count: 5, reason: `${NEVER_EMPTY}: OSV currency is always UZS (ADR 0006)` },
  { file: `${D}accounting/reports/page.tsx`, pattern: 'literal', count: 1, reason: `${NEVER_EMPTY}: statements are in the UZS ledger currency` },
  { file: `${D}analytics/page.tsx`, pattern: 'literal', count: 1, reason: `${NEVER_EMPTY}: the KPI response always carries currency` },
  { file: `${D}analytics/page.tsx`, pattern: 'hook', count: 1, reason: `${NEVER_EMPTY}: the KPI response always carries currency` },
  { file: `${D}counterparties/page.tsx`, pattern: 'hook', count: 1, reason: ZERO },
  { file: `${D}finance/page.tsx`, pattern: 'hook', count: 1, reason: ZERO },
  { file: `${D}finance/page.tsx`, pattern: 'literal', count: 9, reason: `${NEVER_EMPTY}: dashboard accountCurrencies are always set by the API` },
  { file: `${D}inventory/page.tsx`, pattern: 'literal', count: 1, reason: `${NEVER_EMPTY}: products.cost_price_currency` },
  { file: `${D}products/page.tsx`, pattern: 'literal', count: 2, reason: `${NEVER_EMPTY}: products.cost_price_currency` },
  { file: `${D}purchases/expenses/new/page.tsx`, pattern: 'literal', count: 8, reason: `${NEVER_EMPTY}: purchase_receipts.currency` },
  { file: `${D}purchases/expenses/page.tsx`, pattern: 'literal', count: 2, reason: `${NEVER_EMPTY}: additional_expenses.currency` },
  { file: `${D}purchases/expenses/[id]/page.tsx`, pattern: 'literal', count: 5, reason: `${NEVER_EMPTY}: additional_expenses.currency` },
  { file: `${D}purchases/page.tsx`, pattern: 'literal', count: 3, reason: ZERO },
  { file: `${D}purchases/returns/page.tsx`, pattern: 'hook', count: 1, reason: F10 },
  { file: `${D}purchases/suppliers/page.tsx`, pattern: 'hook', count: 1, reason: ZERO },
  { file: `${D}sales/crm/page.tsx`, pattern: 'hook', count: 1, reason: F10 },
  { file: `${D}sales/customers/page.tsx`, pattern: 'hook', count: 1, reason: `${ZERO}; customer profile totals: F10` },
  { file: `${D}sales/page.tsx`, pattern: 'literal', count: 4, reason: ZERO },
  { file: `${D}sales/prices/page.tsx`, pattern: 'hook', count: 1, reason: `${NEVER_EMPTY}: price_lists.currency of the selected list` },
  { file: `${D}sales/returns/page.tsx`, pattern: 'hook', count: 1, reason: `${NEVER_EMPTY}: rendered only with a selected invoice (sales_invoices.currency)` },
  { file: `${D}services/page.tsx`, pattern: 'hook', count: 1, reason: F10 },
  { file: 'app/[locale]/page.tsx', pattern: 'state', count: 1, reason: 'display only; which currency the dashboard chart shows, not a stored value' },
  { file: 'app/[locale]/page.tsx', pattern: 'literal', count: 5, reason: `${ZERO}; chart series pick` },
  { file: 'components/purchases/SupplierProfileDrawer.tsx', pattern: 'literal', count: 1, reason: F10 },
  { file: 'components/sales/OrderDeliveryNoteModal.tsx', pattern: 'literal', count: 1, reason: `${NEVER_EMPTY}: sales_orders.currency (print view)` },
  { file: 'components/sales/SalesInvoiceForm.tsx', pattern: 'literal', count: 1, reason: `${NEVER_EMPTY}: products.cost_price_currency (margin hint only)` },
  { file: 'lib/opening-balance-lines.ts', pattern: 'objectDefault', count: 1, reason: 'defined, not guessed: the fixed-asset register is kept in UZS (D6)' },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.(spec|test)\.tsx?$/.test(name) ? [full] : [];
  });
}

function scan(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const dir of SCANNED_DIRS) {
    for (const file of walk(join(SRC, dir))) {
      const rel = relative(SRC, file).split('\\').join('/');
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        for (const [name, pattern] of Object.entries(PATTERNS)) {
          const key = `${rel} | ${name}`;
          if (pattern.test(line)) counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

const keyOf = (entry: { file: string; pattern: string }) => `${entry.file} | ${entry.pattern}`;

test('no new silent currency guess in the frontend (F8, ADR 0022)', () => {
  const allowed = new Map(ALLOWED.map((entry) => [keyOf(entry), entry.count]));
  const offenders = [...scan()]
    .filter(([key, count]) => count > (allowed.get(key) ?? 0))
    .map(([key, count]) => `${key}: ${count} match(es), ${allowed.get(key) ?? 0} allowed`);
  assert.deepEqual(
    offenders,
    [],
    `start the currency blank and require a choice (see SalesOrderForm / CreateProductDrawer); a display-only case goes in ALLOWED with a reason:\n${offenders.join('\n')}`,
  );
});

test('the allow-list has no stale entries (a fixed guess is removed from it)', () => {
  const counts = scan();
  const stale = ALLOWED.filter((entry) => (counts.get(keyOf(entry)) ?? 0) < entry.count)
    .map((entry) => `${keyOf(entry)}: allowed ${entry.count}, found ${counts.get(keyOf(entry)) ?? 0}`);
  assert.deepEqual(stale, [], `lower or remove these entries:\n${stale.join('\n')}`);
});

test('the scan catches the patterns it is meant to catch', () => {
  assert.ok(PATTERNS.literal.test(`const c = order.currency || 'USD';`));
  assert.ok(PATTERNS.literal.test(`currency ?? 'UZS'`));
  assert.ok(PATTERNS.state.test(`const [currency, setCurrency] = useState<'USD' | 'UZS'>('UZS');`));
  assert.ok(PATTERNS.hook.test('const c = useDefaultCurrency();'));
  assert.ok(PATTERNS.objectDefault.test(`  currency: 'UZS',`));
  assert.ok(!PATTERNS.literal.test(`if (currency === 'UZS') return 1;`));
  assert.ok(!PATTERNS.state.test(`useState('')`));
});
