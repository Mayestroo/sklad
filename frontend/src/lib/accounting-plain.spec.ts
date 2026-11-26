import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accountingPeriodRange, compactAmount, dayGroup, describeEntry, entryEffects, isAccountingPeriod } from './accounting-plain.ts';

const CARDS = {
  money: ['5010', '5020', '5110', '5210'],
  receivables: ['4010'],
  payables: ['6010'],
  inventory: ['1010', '2810', '2910', '2920'],
};
const acc = (code: string, type = 'ASSET') => ({ code, type }) as never;
const line = (debit: string, credit: string, amount: number, debitType = 'ASSET', creditType = 'ASSET') =>
  ({ debitAccount: acc(debit, debitType), creditAccount: acc(credit, creditType), amount }) as never;

describe('accounting-plain', () => {
  it('reads a sale as receivables and profit up, stock down', () => {
    const sale = {
      sourceDocType: 'SalesInvoice',
      status: 'POSTED' as const,
      reversedOfId: null,
      lines: [line('4010', '9010', 10_000_000, 'ASSET', 'REVENUE'), line('9110', '2910', 6_000_000, 'EXPENSE', 'ASSET')],
    };
    const plain = describeEntry(sale, CARDS);
    assert.equal(plain.key, 'sale');
    assert.equal(plain.amount, 10_000_000);
    assert.deepEqual(entryEffects(sale, CARDS), [
      { card: 'receivables', delta: 10_000_000 },
      { card: 'inventory', delta: -6_000_000 },
      { card: 'profit', delta: 4_000_000 },
    ]);
  });

  it('reads a supplier payment as money and debt down', () => {
    const pay = { sourceDocType: 'PurchasePayment', status: 'POSTED' as const, reversedOfId: null, lines: [line('6010', '5010', 5_000_000, 'LIABILITY')] };
    const plain = describeEntry(pay, CARDS);
    assert.equal(plain.key, 'supplierPaid');
    assert.equal(plain.amount, 5_000_000);
    assert.deepEqual(plain.effects, [
      { card: 'money', delta: -5_000_000 },
      { card: 'payables', delta: -5_000_000 },
    ]);
  });

  it('tells money in, money out and transfers apart for cash operations, storno included', () => {
    const base = { sourceDocType: 'FinanceTransaction', status: 'POSTED' as const, reversedOfId: null };
    assert.equal(describeEntry({ ...base, lines: [line('5010', '9390', 100, 'ASSET', 'REVENUE')] }, CARDS).key, 'moneyIn');
    assert.equal(describeEntry({ ...base, lines: [line('9430', '5010', 100, 'EXPENSE')] }, CARDS).key, 'moneyOut');
    assert.equal(describeEntry({ ...base, lines: [line('5110', '5010', 100)] }, CARDS).key, 'transfer');
    // the storno of a money-in still reads as "money in" (cancelled)
    const storno = describeEntry({ ...base, reversedOfId: 'je-1', lines: [line('9390', '5010', 100, 'REVENUE')] }, CARDS);
    assert.equal(storno.key, 'moneyIn');
    assert.equal(storno.isStorno, true);
  });

  it('marks a cancelled entry and a manual one', () => {
    assert.equal(describeEntry({ sourceDocType: 'PurchaseReceipt', status: 'REVERSED', reversedOfId: null, lines: [] }, CARDS).isCancelled, true);
    assert.equal(describeEntry({ sourceDocType: null, status: 'POSTED', reversedOfId: null, lines: [] }, CARDS).key, 'manual');
  });

  it('shortens card amounts', () => {
    const units = { thousand: 'ming', million: 'mln', billion: 'mlrd' };
    assert.equal(compactAmount(120_000_000, units), '120 mln');
    assert.equal(compactAmount(1_250_000_000, units), '1,3 mlrd');
    assert.equal(compactAmount(-5_500_000, units), '−5,5 mln');
    assert.equal(compactAmount(45_000, units), '45 ming');
    assert.equal(compactAmount(900, units), '900');
  });

  it('resolves the period presets', () => {
    const now = new Date(2026, 10, 26);
    assert.deepEqual(accountingPeriodRange('this_month', now), { from: '2026-11-01', to: '2026-11-26' });
    assert.deepEqual(accountingPeriodRange('last_month', now), { from: '2026-10-01', to: '2026-10-31' });
    assert.deepEqual(accountingPeriodRange('this_quarter', now), { from: '2026-10-01', to: '2026-11-26' });
    assert.deepEqual(accountingPeriodRange('2026-11-20_2026-11-01', now), { from: '2026-11-01', to: '2026-11-20' });
    assert.equal(isAccountingPeriod('today'), false);
    assert.equal(dayGroup('2026-11-26', now), 'today');
    assert.equal(dayGroup('2026-11-25', now), 'yesterday');
    assert.equal(dayGroup('2026-11-01', now), 'date');
  });

});
