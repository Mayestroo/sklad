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
  accountId: string;
  transferToId?: string | null;
  counterpartyId?: string | null;
  settlementSide?: 'CUSTOMER' | 'SUPPLIER' | null;
  transactionTypeId?: string | null;
  amount: number;
  currency: string;
  exchangeRate: number;
  transferToAmount?: number | null;
  transferExchangeRate?: number | null;
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

export interface FinanceAccountIdentity {
  accountId: string;
  accountType: CashAccountType;
  name: { uz: string; ru: string };
  currency: string;
}

export interface FinanceSummaryByAccount extends FinanceAccountIdentity {
  totalIncome: number;
  totalExpense: number;
  transferIn: number;
  transferOut: number;
  netCashFlow: number;
}

export interface FinanceSummary {
  summaryByCurrency: FinanceSummaryByCurrency[];
  summaryByAccount: FinanceSummaryByAccount[];
  accounts: CashAccount[];
}

export interface FinanceAccountFlow extends FinanceAccountIdentity {
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  netCashFlow: number;
}

export interface FinanceDashboardMetrics {
  balances: {
    dollarKassa: number;
    naqdKassa: number;
    hisobRaqam: number;
    accountCurrencies: {
      dollarKassa: string;
      naqdKassa: string;
      hisobRaqam: string;
    };
    totalLiquidByCurrency: Array<{ currency: string; amount: number }>;
    totalLiquidUZSEquivalent: number;
  };
  today: {
    income: number;
    expense: number;
    netCashFlow: number;
    byCurrency: Array<{ currency: string; income: number; expense: number; netCashFlow: number }>;
    byAccount: FinanceAccountFlow[];
  };
  month: {
    income: number;
    expense: number;
    netCashFlow: number;
    byCurrency: Array<{ currency: string; income: number; expense: number; netCashFlow: number }>;
    byAccount: FinanceAccountFlow[];
  };
  debts: {
    receivables: number;
    payables: number;
    receivablesByCurrency: Array<{ currency: string; amount: number }>;
    payablesByCurrency: Array<{ currency: string; amount: number }>;
    customerAdvancesByCurrency: Array<{ currency: string; amount: number }>;
    supplierAdvancesByCurrency: Array<{ currency: string; amount: number }>;
  };
  accounts: CashAccount[];
}

export interface TransactionJournal {
  total: number;
  page: number;
  limit: number;
  data: FinanceTransaction[];
}
