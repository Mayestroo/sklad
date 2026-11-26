/**
 * Buxgalteriya TZ, simple mode: what a journal entry means in plain words
 * (no debit/credit), which balance cards it moved, compact amounts for the
 * cards, the period presets of the section and the spreadsheet export.
 * Pure functions: the page translates the keys (messages `acct.*`).
 */
import { formatNumber } from '../../../shared/format/money.ts';
import { quickPeriodRange } from './date-range.ts';
import type { AccountingCardKey, JournalEntry } from '../../../shared/types/accounting.ts';

export type EffectKey = AccountingCardKey | 'profit';

export interface EntryEffect {
  card: EffectKey;
  /** Change of the card's figure: + more money / more debt owed to us / more stock / more debt we owe / more profit. */
  delta: number;
}

/** Keys of the plain sentences (messages `acct.plain.<key>`). */
export type PlainKey =
  | 'sale'
  | 'saleReturn'
  | 'saleReturnCancel'
  | 'purchase'
  | 'purchaseReturn'
  | 'purchaseExpense'
  | 'customerPaid'
  | 'supplierPaid'
  | 'moneyIn'
  | 'moneyOut'
  | 'transfer'
  | 'production'
  | 'opening'
  | 'serviceAct'
  | 'stockTransfer'
  | 'inventoryDoc'
  | 'manual'
  | 'other';

export interface PlainEntry {
  key: PlainKey;
  /** The headline amount of the sentence (UZS, positive). */
  amount: number;
  effects: EntryEffect[];
  /** This entry is a storno: it cancels `reversedOf`. */
  isStorno: boolean;
  /** This entry was cancelled by a storno. */
  isCancelled: boolean;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Card deltas of an entry. Asset cards grow with debits, the payables card with credits. */
export function entryEffects(entry: Pick<JournalEntry, 'lines'>, cards: Record<AccountingCardKey, string[]>): EntryEffect[] {
  const totals: Record<EffectKey, number> = { money: 0, receivables: 0, payables: 0, inventory: 0, profit: 0 };
  for (const line of entry.lines ?? []) {
    const amount = Number(line.amount) || 0;
    const debit = line.debitAccount;
    const credit = line.creditAccount;
    for (const key of ['money', 'receivables', 'inventory'] as const) {
      if (debit && cards[key].includes(debit.code)) totals[key] += amount;
      if (credit && cards[key].includes(credit.code)) totals[key] -= amount;
    }
    if (credit && cards.payables.includes(credit.code)) totals.payables += amount;
    if (debit && cards.payables.includes(debit.code)) totals.payables -= amount;
    if (credit?.type === 'REVENUE') totals.profit += amount;
    if (debit?.type === 'REVENUE') totals.profit -= amount;
    if (debit?.type === 'EXPENSE') totals.profit -= amount;
    if (credit?.type === 'EXPENSE') totals.profit += amount;
  }
  return (Object.keys(totals) as EffectKey[]).map((card) => ({ card, delta: round2(totals[card]) })).filter((e) => e.delta !== 0);
}

const KEY_BY_SOURCE: Record<string, PlainKey> = {
  SalesInvoice: 'sale',
  SalesOrder: 'sale',
  SalesReturn: 'saleReturn',
  SalesReturnCancel: 'saleReturnCancel',
  PurchaseReceipt: 'purchase',
  PurchaseReturn: 'purchaseReturn',
  AdditionalExpense: 'purchaseExpense',
  PurchaseExpense: 'purchaseExpense',
  Payment: 'customerPaid',
  PAYMENT: 'customerPaid',
  PurchasePayment: 'supplierPaid',
  ProductionDocument: 'production',
  OpeningBalanceDocument: 'opening',
  OpeningBalanceLine: 'opening',
  ServiceAct: 'serviceAct',
  StockTransfer: 'stockTransfer',
  InventoryDocument: 'inventoryDoc',
};

/** The plain-words reading of a journal entry for the simple mode (TZ 6, 10.1). */
export function describeEntry(
  entry: Pick<JournalEntry, 'sourceDocType' | 'lines' | 'status' | 'reversedOfId'>,
  cards: Record<AccountingCardKey, string[]>,
): PlainEntry {
  const effects = entryEffects(entry, cards);
  const delta = (card: EffectKey) => effects.find((e) => e.card === card)?.delta ?? 0;
  const lines = entry.lines ?? [];
  const largest = lines.reduce((max, l) => Math.max(max, Number(l.amount) || 0), 0);
  // A storno has the same source and swapped sides: describe what it cancels.
  const sign = entry.reversedOfId ? -1 : 1;

  let key: PlainKey = entry.sourceDocType ? (KEY_BY_SOURCE[entry.sourceDocType] ?? 'other') : 'manual';
  if (entry.sourceDocType === 'FinanceTransaction') {
    const money = sign * delta('money');
    const touchesMoney = lines.some((l) => cards.money.includes(l.debitAccount?.code ?? '') || cards.money.includes(l.creditAccount?.code ?? ''));
    key = money > 0 ? 'moneyIn' : money < 0 ? 'moneyOut' : touchesMoney ? 'transfer' : 'other';
  }

  const headline: Partial<Record<PlainKey, number>> = {
    sale: Math.abs(delta('receivables')) || Math.abs(delta('money')),
    saleReturn: Math.abs(delta('receivables')) || Math.abs(delta('money')),
    purchase: Math.abs(delta('payables')) || Math.abs(delta('inventory')),
    purchaseReturn: Math.abs(delta('payables')) || Math.abs(delta('inventory')),
    customerPaid: Math.abs(delta('money')),
    supplierPaid: Math.abs(delta('money')),
    moneyIn: Math.abs(delta('money')),
    moneyOut: Math.abs(delta('money')),
  };
  return {
    key,
    amount: round2(headline[key] || largest),
    effects,
    isStorno: Boolean(entry.reversedOfId),
    isCancelled: entry.status === 'REVERSED',
  };
}

export interface CompactUnits {
  thousand: string;
  million: string;
  billion: string;
}

/** "120 mln" for a card (the full amount goes in the tooltip, TZ 13.2). */
export function compactAmount(value: number, units: CompactUnits): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  const scaled = (n: number, unit: string) => `${sign}${formatNumber(n, { maximumFractionDigits: n < 10 ? 1 : 0 })} ${unit}`;
  if (abs >= 1e9) return scaled(abs / 1e9, units.billion);
  if (abs >= 1e6) return scaled(abs / 1e6, units.million);
  if (abs >= 1e4) return scaled(abs / 1e3, units.thousand);
  return `${sign}${formatNumber(abs, { maximumFractionDigits: 0 })}`;
}

/** Period presets of the accounting section (TZ 13.4); a custom range is "from_to". */
export const ACCOUNTING_PERIODS = ['this_month', 'last_month', 'this_quarter', 'this_year'] as const;
export type AccountingPeriodPreset = (typeof ACCOUNTING_PERIODS)[number];
const CUSTOM = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;

export function isAccountingPeriod(value: string): boolean {
  return (ACCOUNTING_PERIODS as readonly string[]).includes(value) || CUSTOM.test(value);
}

/** Inclusive dates of a period value; unknown values mean this month. */
export function accountingPeriodRange(value: string, now: Date = new Date()): { from: string; to: string } {
  const custom = CUSTOM.exec(value);
  if (custom) {
    const [a, b] = [custom[1], custom[2]];
    return a <= b ? { from: a, to: b } : { from: b, to: a };
  }
  if (value === 'last_month' || value === 'this_quarter' || value === 'this_year') {
    const r = quickPeriodRange(value, now);
    return { from: r.date_from, to: r.date_to };
  }
  const r = quickPeriodRange('this_month', now);
  return { from: r.date_from, to: r.date_to };
}

/** Day groups of the movements list: today, yesterday, then the date (TZ 6). */
export function dayGroup(isoDay: string, now: Date = new Date()): 'today' | 'yesterday' | 'date' {
  const today = quickPeriodRange('today', now).date_from;
  const yesterday = quickPeriodRange('yesterday', now).date_from;
  return isoDay === today ? 'today' : isoDay === yesterday ? 'yesterday' : 'date';
}

/**
 * A spreadsheet file Excel opens directly: UTF-8 with BOM, ";" between
 * cells (the separator Excel uses with uz/ru regional settings), numbers with
 * a dot and no grouping so they stay numbers.
 */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
