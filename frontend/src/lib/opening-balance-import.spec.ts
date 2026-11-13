import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openingBalanceImportPaths, summarizeImportPreview } from './opening-balance-import.ts';

test('paths match the backend routes in OpeningBalancesController', () => {
  assert.deepEqual(openingBalanceImportPaths('doc-1'), {
    template: '/opening-balances/template',
    preview: '/opening-balances/doc-1/import-preview',
    commit: '/opening-balances/doc-1/import-commit',
  });
});

test('a clean preview can be committed and is counted per category', () => {
  const summary = summarizeImportPreview({
    fileName: 'a.xlsx',
    totalRows: 3,
    validRows: 3,
    errorCount: 0,
    errors: [],
    previewLines: [{ category: 'CASH' }, { category: 'INVENTORY' }, { category: 'CASH' }],
  });
  assert.equal(summary.canCommit, true);
  assert.equal(summary.lineCount, 3);
  assert.deepEqual(summary.byCategory, [
    { category: 'CASH', count: 2 },
    { category: 'INVENTORY', count: 1 },
  ]);
});

test('any row error blocks the commit', () => {
  const summary = summarizeImportPreview({
    fileName: 'a.xlsx',
    totalRows: 2,
    validRows: 1,
    errorCount: 1,
    errors: [{ sheetName: '1_Pul', rowNumber: 3, errorMessage: 'x' }],
    previewLines: [{ category: 'CASH' }],
  });
  assert.equal(summary.canCommit, false);
});

test('an empty file cannot be committed', () => {
  const summary = summarizeImportPreview({
    fileName: 'a.xlsx',
    totalRows: 0,
    validRows: 0,
    errorCount: 0,
    errors: [],
    previewLines: [],
  });
  assert.equal(summary.canCommit, false);
  assert.equal(summary.lineCount, 0);
});
