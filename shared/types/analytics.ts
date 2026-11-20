import { TranslatableField } from './i18n';

export interface KpiSummary {
  totalRevenue: number;
  totalRevenueByCurrency: Array<{ currency: string; amount: number }>;
  grossProfit: number;
  grossProfitByCurrency: Array<{ currency: string; amount: number }>;
  netProfitMargin: number;
  totalAccountsReceivable: number; // Debitorlik
  totalAccountsPayable: number;    // Kreditorlik
  receivablesByCurrency: Array<{ currency: string; amount: number }>;
  payablesByCurrency: Array<{ currency: string; amount: number }>;
  /** COGS of the period, UZS. */
  totalCogs: number;
  inventoryValuation: number;      // Ombor qiymati (FIFO landed cost)
  inventoryCurrency: 'UZS';
  currency: string;
}

export interface SalesTrendDataPoint {
  period: string; // e.g. "2026-01" or "Mon"
  /** Amounts are converted at each invoice's posted rate (ADR 0023). */
  currency: 'UZS';
  revenue: number;
  cogs: number;
  profit: number;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  categoryName: TranslatableField;
  currency: 'UZS';
  revenue: number;
  percentage: number;
}

export interface TopProductItem {
  productId: string;
  productName: TranslatableField;
  sku: string;
  totalQuantity: number;
  currency: 'UZS';
  totalRevenue: number;
  unitOfMeasure: string;
}

/** GET /analytics/top-clients — posted invoices, converted at each invoice's rate. */
export interface TopClientItem {
  counterpartyId: string;
  name: string;
  inn?: string | null;
  invoiceCount: number;
  currency: 'UZS';
  totalSpent: number;
}

export interface FinancialRatios {
  currency: 'UZS';
  /** null when it cannot be computed honestly (e.g. debts in USD). */
  workingCapital: number | null;
  inventoryTurnoverDays: number | null;
  arCollectionDays: number | null;
}
