// Finance Module Types

export type CashAccountType = 'USD_CASH' | 'UZS_CASH' | 'BANK';
export type TransactionDirection = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type TransactionStatus = 'POSTED' | 'CANCELLED';

export interface CashAccount {
  id: string;
  tenantId: string;
  accountType: CashAccountType;
  name: { uz: string; ru: string };
  currency: string;
  balance: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionType {
  id: string;
  tenantId?: string | null;
  direction: TransactionDirection;
  name: { uz: string; ru: string };
  isSystem: boolean;
}

export interface FinanceTransaction {
  id: string;
  tenantId: string;
  direction: TransactionDirection;
  status: TransactionStatus;
  accountId?: string | null;
  transferToId?: string | null;
  counterpartyId?: string | null;
  transactionTypeId?: string | null;
  amount: number;
  currency: string;
  transactionDate: string;
  comment?: string | null;
  docNumber?: string | null;
  sourceDocType?: string | null;
  sourceDocId?: string | null;
  responsibleUserId?: string | null;
  cancelledById?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  createdById?: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  // Relations
  account?: CashAccount | null;
  transferToAccount?: CashAccount | null;
  counterparty?: { id: string; name: string; type: string } | null;
  transactionType?: TransactionType | null;
}

export interface FinanceSummaryByCurrency {
  currency: string;
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
}

export interface FinanceSummary {
  summaryByCurrency: FinanceSummaryByCurrency[];
  accounts: CashAccount[];
}

export interface FinanceDashboardMetrics {
  balances: {
    dollarKassa: number;
    naqdKassa: number;
    hisobRaqam: number;
    totalLiquidUZSEquivalent: number;
  };
  today: {
    income: number;
    expense: number;
    netCashFlow: number;
  };
  month: {
    income: number;
    expense: number;
    netCashFlow: number;
  };
  debts: {
    receivables: number;
    payables: number;
  };
  accounts: CashAccount[];
}

export interface TransactionJournal {
  total: number;
  page: number;
  limit: number;
  data: FinanceTransaction[];
}

