import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * muammolar.pdf B6 / owner decision D6: depreciation of opening-balance
 * fixed assets is not computed. The page must say so, and must not hide
 * depreciation above cost behind a net value of 0 (the server rejects it).
 * No DOM test runner here, so the page source is checked.
 */
const page = readFileSync(
  fileURLToPath(new URL('../app/[locale]/(dashboard)/opening-balances/page.tsx', import.meta.url)),
  'utf8',
);
const fixedAssetsTab = page.slice(page.indexOf("activeTab === 'fixed-assets'"));
const table = page.slice(page.indexOf('function FixedAssetsTable('));

test('the fixed-asset tab states, in both languages, that depreciation is not computed', () => {
  assert.match(fixedAssetsTab, /data-testid="fixed-asset-depreciation-notice"/);
  assert.match(fixedAssetsTab, /Амортизация не рассчитывается автоматически/);
  assert.match(fixedAssetsTab, /Eskirish tizimda avtomatik hisoblanmaydi/);
});

test('depreciation above cost is flagged on the line instead of showing a net value of 0', () => {
  assert.match(table, /const overDepreciated = accDep > initCost;/);
  assert.match(table, /data-testid="fixed-asset-over-depreciated"/);
});

test('the net value uses the line currency, never a USD fallback (ADR 0022)', () => {
  const body = table.slice(0, table.indexOf('\nfunction ', 10));
  assert.doesNotMatch(body, /currency \|\| 'USD'/);
  assert.match(body, /formatCurrencyIfAvailable\(netBookValue, locale, line\.currency, currency\)/);
});

test('D6: each line picks an asset from the register; cost and depreciation come from it (read-only)', () => {
  const body = table.slice(0, table.indexOf('\nfunction ', 10));
  assert.match(body, /data-testid="fixed-asset-register-select"/);
  assert.match(body, /value=\{line\.fixedAssetId \|\| ''\}/);
  assert.match(body, /onUpdate\(index, 'fixedAssetId', value\)/);
  assert.match(body, /fixedAssets\.map\(/);
  // Values come from the register: not typed on a linked line.
  assert.equal((body.match(/disabled=\{isReadOnly \|\| Boolean\(line\.fixedAssetId\)\}/g) ?? []).length, 2);
  assert.match(page, /withRegisterAsset\(target, fixedAssets\.find\(/);
});
