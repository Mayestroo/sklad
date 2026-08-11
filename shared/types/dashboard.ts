// Dashboard Module Types

import type { CashAccount, FinanceSummaryByCurrency, FinanceTransaction } from './finance';

export interface DashboardFinanceKPIs {
  summaryByCurrency: FinanceSummaryByCurrency[];
  accounts: CashAccount[];
  profit: {
    grossProfit: number;
    netProfit: number;
    revenue: number;
    cogs: number;
  };
}

export interface SalesDynamic {
  period: string;
  amount: number;
}

export interface DashboardSalesKPIs {
  totalSales: number;
  invoiceCount: number;
  dynamics: SalesDynamic[];
}

export interface TopDebtor {
  id: string;
  name: string;
  amount: number;
}

export interface DashboardDebts {
  receivable: {
    total: number;
    count: number;
    topDebtors: TopDebtor[];
  };
  payable: {
    total: number;
    count: number;
    topCreditors: TopDebtor[];
  };
}

export interface CashFlowPoint {
  period: string;
  income: number;
  expense: number;
}

export interface DashboardCashFlow {
  series: CashFlowPoint[];
  granularity: 'day' | 'week' | 'month';
}

export interface FullDashboard {
  finance: DashboardFinanceKPIs;
  sales: DashboardSalesKPIs;
  debts: DashboardDebts;
  cashFlow: DashboardCashFlow;
  recentTransactions: FinanceTransaction[];
}

export type DashboardPeriod =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom';
