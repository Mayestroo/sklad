import type { TranslatableField } from './i18n';

/** The ledger currency: journal line amounts and every accounting report are in UZS (ADR 0006). */
export const LEDGER_CURRENCY = 'UZS' as const;
export type LedgerCurrency = typeof LEDGER_CURRENCY;

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface Account {
  id: string;
  tenantId: string;
  code: string; // NAS code (e.g. "2910")
  /** Official (chart of accounts) name. */
  name: TranslatableField;
  /** Plain-language name for the simple mode: the tenant's own, else the default for the code, else null. */
  alias: TranslatableField | null;
  /** True when the tenant typed its own alias (false: the default alias or none). */
  aliasCustom?: boolean;
  type: AccountType;
  isSystem: boolean;
  /** Technical accounts (00) are hidden in the simple mode and kept out of totals. */
  isTechnical: boolean;
  isActive: boolean;
  /** Whether any journal line uses the account (a used account is deactivated, never deleted). */
  isUsed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JournalLine {
  id: string;
  entryId: string;
  debitAccountId: string;
  creditAccountId: string;
  /** UZS value (ADR 0006). */
  amount: number;
  /** Currency of the source document side, and the amount in it (TZ 15). */
  currency: string;
  amountOrig: number;
  description: string | null;
  debitAccount?: Account;
  creditAccount?: Account;
}

export type JournalEntryStatus = 'POSTED' | 'REVERSED';

export interface JournalEntry {
  id: string;
  tenantId: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  sourceDocType: string | null;
  sourceDocId: string | null;
  /** REVERSED once a storno entry cancelled it (entries are never deleted). */
  status: JournalEntryStatus;
  /** Set on a storno entry: the entry it reverses. */
  reversedOfId: string | null;
  reversedOf?: { id: string; entryNumber: string } | null;
  reversal?: { id: string; entryNumber: string } | null;
  createdAt: string;
  lines?: JournalLine[];
}

export interface JournalEntryPage {
  items: JournalEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TrialBalanceItem {
  accountId: string;
  accountCode: string;
  accountName: TranslatableField;
  accountAlias: TranslatableField | null;
  accountType: AccountType;
  isTechnical: boolean;
  /** Balance before the period (signed by account type: assets and expenses debit-positive). */
  openingBalance: number;
  debitTurnover: number;
  creditTurnover: number;
  closingBalance: number;
}

export interface TrialBalanceReport {
  /** Inclusive ISO dates (YYYY-MM-DD); null periodStart means "from the first entry". */
  periodStart: string | null;
  periodEnd: string;
  /** Journal lines are always UZS (ADR 0006). */
  currency: 'UZS';
  items: TrialBalanceItem[];
  totalDebitTurnover: number;
  totalCreditTurnover: number;
}

export interface FinancialStatements {
  currency: 'UZS';
  periodStart: string | null;
  periodEnd: string;
  balanceSheet: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    isBalanced: boolean;
  };
  profitLoss: {
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    netProfit: number;
  };
}

// ── Buxgalteriya TZ: simple-mode summary, health checks, reports ─────────────

/** The four balance cards whose accounts are configurable (TZ 5.2). */
export type AccountingCardKey = 'money' | 'receivables' | 'payables' | 'inventory';
export const ACCOUNTING_CARD_KEYS: AccountingCardKey[] = ['money', 'receivables', 'payables', 'inventory'];

/** Default card → account mapping (TZ 5.2); a tenant may override it in its accounting settings. */
export const DEFAULT_CARD_ACCOUNTS: Record<AccountingCardKey, string[]> = {
  money: ['5010', '5020', '5110', '5210'],
  receivables: ['4010'],
  payables: ['6010'],
  inventory: ['1010', '2810', '2910', '2920'],
};

/** Codes of technical accounts (hidden in the simple mode, kept out of totals). */
export const TECHNICAL_ACCOUNT_CODES = ['00'];

/** Plain-language names for the default chart (TZ 8, 12.2); the official name stays on the account. */
export const DEFAULT_ACCOUNT_ALIASES: Record<string, TranslatableField> = {
  '00': { uz: 'Boshlang‘ich qoldiqlar (texnik hisob)', ru: 'Ввод остатков (технический счёт)' },
  '0100': { uz: 'Asosiy vositalar', ru: 'Основные средства' },
  '0200': { uz: 'Asosiy vositalar eskirishi', ru: 'Износ основных средств' },
  '1010': { uz: 'Xomashyo va materiallar', ru: 'Сырьё и материалы' },
  '2810': { uz: 'Tayyor mahsulot', ru: 'Готовая продукция' },
  '2910': { uz: 'Ombordagi tovar', ru: 'Товары на складе' },
  '2920': { uz: 'Yo‘ldagi tovar', ru: 'Товары в пути' },
  '4010': { uz: 'Mijozlar qarzi', ru: 'Долги клиентов' },
  '4410': { uz: 'Qaytariladigan QQS', ru: 'НДС к возмещению' },
  '4890': { uz: 'Boshqa qarzdorlar', ru: 'Прочие должники' },
  '5010': { uz: 'Kassa (so‘m)', ru: 'Касса (сум)' },
  '5020': { uz: 'Valyuta kassasi', ru: 'Валютная касса' },
  '5110': { uz: 'Bank hisobi', ru: 'Банковский счёт' },
  '5210': { uz: 'Valyuta bank hisobi', ru: 'Валютный банковский счёт' },
  '6010': { uz: 'Yetkazib beruvchilarga qarz', ru: 'Долг поставщикам' },
  '6410': { uz: 'Soliq bo‘yicha qarz (QQS)', ru: 'Долг по налогам (НДС)' },
  '6990': { uz: 'Boshqa qarzlar', ru: 'Прочие долги' },
  '8330': { uz: 'Ustav kapitali', ru: 'Уставный капитал' },
  '8710': { uz: 'Yig‘ilgan foyda', ru: 'Накопленная прибыль' },
  '9010': { uz: 'Tovar sotishdan daromad', ru: 'Выручка от продажи товаров' },
  '9030': { uz: 'Xizmatlardan daromad', ru: 'Выручка от услуг' },
  '9110': { uz: 'Sotilgan mol tannarxi', ru: 'Себестоимость проданного' },
  '9390': { uz: 'Boshqa daromadlar', ru: 'Прочие доходы' },
  '9420': { uz: 'Ma’muriy xarajatlar', ru: 'Административные расходы' },
  '9430': { uz: 'Boshqa xarajatlar', ru: 'Прочие расходы' },
  '9540': { uz: 'Kurs farqidan foyda', ru: 'Курсовая прибыль' },
  '9620': { uz: 'Kurs farqidan zarar', ru: 'Курсовой убыток' },
};

/** Document-type filter of the movements list (TZ 6). */
export type JournalSourceGroup = 'sales' | 'purchases' | 'payments' | 'production' | 'opening' | 'other';
export const JOURNAL_SOURCE_GROUP_KEYS: JournalSourceGroup[] = ['sales', 'purchases', 'payments', 'production', 'opening', 'other'];
export const JOURNAL_SOURCE_GROUPS: Record<Exclude<JournalSourceGroup, 'other'>, string[]> = {
  sales: ['SalesInvoice', 'SalesOrder', 'SalesReturn', 'SalesReturnCancel'],
  purchases: ['PurchaseReceipt', 'PurchaseReturn', 'AdditionalExpense', 'PurchaseExpense'],
  payments: ['Payment', 'PAYMENT', 'PurchasePayment', 'FinanceTransaction'],
  production: ['ProductionDocument'],
  opening: ['OpeningBalanceDocument', 'OpeningBalanceLine'],
};

export function journalSourceGroup(sourceDocType: string | null | undefined): JournalSourceGroup {
  if (sourceDocType) {
    for (const key of Object.keys(JOURNAL_SOURCE_GROUPS) as Array<Exclude<JournalSourceGroup, 'other'>>) {
      if (JOURNAL_SOURCE_GROUPS[key].includes(sourceDocType)) return key;
    }
  }
  return 'other';
}

export interface SummaryAccountPart {
  accountId: string;
  code: string;
  name: TranslatableField;
  alias: TranslatableField | null;
  balance: number;
}

export interface SummaryCard {
  /** Today's balance (balance cards) or the period result (profit). */
  value: number;
  /** Same figure at the start of the period (balance cards) or for the previous period of equal length (profit). */
  previous: number;
  parts: SummaryAccountPart[];
}

export interface AccountingSummary {
  currency: 'UZS';
  periodStart: string;
  periodEnd: string;
  hasData: boolean;
  cards: {
    money: SummaryCard;
    receivables: SummaryCard;
    payables: SummaryCard;
    inventory: SummaryCard;
    profit: SummaryCard & { revenue: number; expenses: number };
    netWorth: SummaryCard;
  };
  /** Which account codes feed each balance card. */
  cardAccounts: Record<AccountingCardKey, string[]>;
  health: AccountingHealth;
  recent: JournalEntry[];
}

export type AccountingIssueCode =
  | 'ENTRY_WITHOUT_LINES'
  | 'DOCUMENT_WITHOUT_ENTRY'
  | 'INVENTORY_MISMATCH'
  | 'NEGATIVE_CASH';

export interface AccountingIssue {
  code: AccountingIssueCode;
  severity: 'warning' | 'error';
  /** Values for the message (document number, amount, account code...). */
  params: Record<string, string | number>;
  /** Where to fix it, if anywhere (a document or list page). */
  href?: string;
}

export interface AccountingHealth {
  ok: boolean;
  checkedAt: string;
  issues: AccountingIssue[];
}

export type AccountingReportType = 'profit-loss' | 'balance' | 'cash-flow';

export interface ReportLine {
  code?: string;
  name: TranslatableField;
  amount: number;
}

export interface ProfitLossReport {
  type: 'profit-loss';
  currency: 'UZS';
  periodStart: string | null;
  periodEnd: string;
  revenue: ReportLine[];
  expenses: ReportLine[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

export interface BalanceReport {
  type: 'balance';
  currency: 'UZS';
  periodEnd: string;
  assets: ReportLine[];
  liabilities: ReportLine[];
  equity: ReportLine[];
  totalAssets: number;
  totalLiabilities: number;
  /** Equity accounts plus the not yet closed result (revenue − expenses). */
  totalEquity: number;
  isBalanced: boolean;
}

export interface CashFlowReport {
  type: 'cash-flow';
  currency: 'UZS';
  periodStart: string | null;
  periodEnd: string;
  opening: number;
  inflow: number;
  outflow: number;
  closing: number;
  /** Money in/out by the account on the other side (customers, suppliers, expenses...). */
  inflowBy: ReportLine[];
  outflowBy: ReportLine[];
}

export type AccountingReport = ProfitLossReport | BalanceReport | CashFlowReport;
