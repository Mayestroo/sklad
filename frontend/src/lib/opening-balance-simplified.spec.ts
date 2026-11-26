import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  counterpartiesForKind,
  documentUsdRate,
  needsUsdRate,
  openingBalanceSaveBlocker,
  suggestedStraightLineDepreciation,
  withDocumentRate,
} from './opening-balance-lines.ts';
import { computeOpeningBalanceTotals } from '../../../shared/types/opening-balance-posting.ts';

test('one document USD rate goes on every USD line; UZS lines get 1; blank currency stays blank', () => {
  const lines = withDocumentRate(
    [
      { currency: 'USD', exchangeRate: 11000 },
      { currency: 'UZS', exchangeRate: '' },
      { currency: '', exchangeRate: '' },
    ],
    '12500',
  );
  assert.deepEqual(
    lines.map((l) => l.exchangeRate),
    ['12500', 1, ''],
  );
});

test('a loaded document shows its USD rate and says when USD lines disagree', () => {
  assert.deepEqual(documentUsdRate([{ currency: 'UZS', exchangeRate: 1 }]), { rate: '', mixed: false });
  assert.deepEqual(
    documentUsdRate([
      { currency: 'USD', exchangeRate: 12500 },
      { currency: 'USD', exchangeRate: '12500' },
    ]),
    { rate: '12500', mixed: false },
  );
  assert.equal(
    documentUsdRate([
      { currency: 'USD', exchangeRate: 12500 },
      { currency: 'USD', exchangeRate: 12000 },
    ]).mixed,
    true,
  );
});

test('a USD line needs a positive document rate (never guessed, ADR 0022)', () => {
  assert.equal(needsUsdRate([{ currency: 'UZS' }], ''), false);
  assert.equal(needsUsdRate([{ currency: 'USD' }], ''), true);
  assert.equal(needsUsdRate([{ currency: 'USD' }], '0'), true);
  assert.equal(needsUsdRate([{ currency: 'USD' }], '12500'), false);
});

test('debts and advances offer the counterparties of their side', () => {
  const all = [
    { id: 'c', type: 'CUSTOMER' },
    { id: 's', type: 'SUPPLIER' },
    { id: 'b', type: 'BOTH' },
  ];
  assert.deepEqual(counterpartiesForKind('CUSTOMER_DEBT', all).map((c) => c.id), ['c', 'b']);
  assert.deepEqual(counterpartiesForKind('CUSTOMER_ADVANCE', all).map((c) => c.id), ['c', 'b']);
  assert.deepEqual(counterpartiesForKind('SUPPLIER_DEBT', all).map((c) => c.id), ['s', 'b']);
  assert.deepEqual(counterpartiesForKind('SUPPLIER_ADVANCE', all).map((c) => c.id), ['s', 'b']);
});

test('suggested depreciation is straight line by months in use, capped at cost (B6)', () => {
  const base = { cost: 1_200_000, usefulLifeMonths: 60 };
  assert.equal(suggestedStraightLineDepreciation({ ...base, acquisitionDate: '2025-10-15', asOf: '2026-10-01' }), 240_000);
  assert.equal(suggestedStraightLineDepreciation({ ...base, acquisitionDate: '2010-01-01', asOf: '2026-10-01' }), 1_200_000);
  assert.equal(suggestedStraightLineDepreciation({ ...base, acquisitionDate: '2026-10-20', asOf: '2026-10-01' }), 0);
  assert.equal(suggestedStraightLineDepreciation({ ...base, acquisitionDate: '', asOf: '2026-10-01' }), null);
  assert.equal(suggestedStraightLineDepreciation({ cost: 0, usefulLifeMonths: 60, acquisitionDate: '2025-01-01', asOf: '2026-10-01' }), null);
});

test('equity balances itself: retained earnings = assets − liabilities − entered capital', () => {
  const totals = computeOpeningBalanceTotals([
    { category: 'CASH', amount: 1000, currency: 'UZS', exchangeRate: 1 },
    { category: 'INVENTORY', quantity: 2, unitCost: 4, amount: 999, currency: 'USD', exchangeRate: 100 },
    { category: 'FIXED_ASSET', amount: 500, accumulatedDepreciation: 200, currency: 'UZS', exchangeRate: 1 },
    { category: 'SUPPLIER_DEBT', amount: 300, currency: 'UZS', exchangeRate: 1 },
    { category: 'EQUITY', amount: 400, currency: 'UZS', exchangeRate: 1 },
  ]);
  // Inventory is quantity × cost (2 × 4 USD × 100), not the typed 999.
  assert.equal(totals.totalAssets, 1000 + 800 + 300);
  assert.equal(totals.totalLiabilities, 300);
  assert.equal(totals.enteredEquity, 400);
  assert.equal(totals.retainedEarnings, 1400);
  assert.equal(totals.totalEquity, 1800);
  assert.equal(totals.hasValidCurrencyRates, true);
});

test('a USD line without a rate is left out of the totals and flagged', () => {
  const totals = computeOpeningBalanceTotals([{ category: 'CASH', amount: 10, currency: 'USD', exchangeRate: '' }]);
  assert.equal(totals.totalAssets, 0);
  assert.equal(totals.hasValidCurrencyRates, false);
});

test('autosave waits for a currency on every line, then for the USD rate', () => {
  assert.equal(openingBalanceSaveBlocker([], ''), null);
  assert.deepEqual(
    openingBalanceSaveBlocker(
      [
        { category: 'INVENTORY', currency: '' },
        { category: 'CUSTOMER_DEBT', currency: null },
        { category: 'INVENTORY', currency: ' ' },
        { category: 'CASH', currency: 'UZS' },
      ],
      '',
    ),
    { kind: 'currency', categories: ['INVENTORY', 'CUSTOMER_DEBT'] },
  );
  assert.deepEqual(openingBalanceSaveBlocker([{ category: 'CASH', currency: 'USD' }], ''), { kind: 'usdRate' });
  assert.equal(openingBalanceSaveBlocker([{ category: 'CASH', currency: 'USD' }], '12500'), null);
});
