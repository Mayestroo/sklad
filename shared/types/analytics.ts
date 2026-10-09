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
  inventoryValuation: number;      // Ombor qiymati
  inventoryCurrency: 'UZS';
  currency: string;
}

export interface SalesTrendDataPoint {
  period: string; // e.g. "2026-01" or "Mon"
  revenue: number;
  cogs: number;
  profit: number;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  categoryName: TranslatableField;
  revenue: number;
  percentage: number;
}

export interface TopProductItem {
  productId: string;
  productName: TranslatableField;
  sku: string;
  totalQuantity: number;
  totalRevenue: number;
  unitOfMeasure: string;
}

export interface FinancialRatios {
  workingCapital: number;
  inventoryTurnoverDays: number;
  arCollectionDays: number;
}
