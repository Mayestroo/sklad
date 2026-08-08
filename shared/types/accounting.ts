import { TranslatableField } from './i18n';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface Account {
  id: string;
  tenantId: string;
  code: string; // NAS code (e.g. "2910")
  name: TranslatableField;
  type: AccountType;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JournalLine {
  id: string;
  entryId: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  description: string | null;
  debitAccount?: Account;
  creditAccount?: Account;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  sourceDocType: string | null;
  sourceDocId: string | null;
  createdAt: string;
  lines?: JournalLine[];
}

export interface TrialBalanceItem {
  accountCode: string;
  accountName: TranslatableField;
  accountType: AccountType;
  debitTurnover: number;
  creditTurnover: number;
  closingBalance: number;
}

export interface TrialBalanceReport {
  periodStart: string;
  periodEnd: string;
  items: TrialBalanceItem[];
  totalDebitTurnover: number;
  totalCreditTurnover: number;
}
