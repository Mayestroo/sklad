import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { analyticsRangeStart, toUzsRate } from './analytics-range';

const round2 = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Revenue and profit cover the selected period; debts and inventory are
   * balances as of now. Inventory is valued at its FIFO landed cost (UZS).
   */
  async getKpiSummary(tenantId: string, range?: string) {
    const since = analyticsRangeStart(range);
    const [invoices, returns, balances, batches] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: {
          tenantId,
          status: 'POSTED',
          ...(since ? { invoiceDate: { gte: since } } : {}),
        },
        select: {
          totalAmount: true,
          vatAmount: true,
          totalCogs: true,
          grossProfit: true,
          currency: true,
          exchangeRate: true,
        },
      }),
      this.prisma.salesReturn.findMany({
        where: {
          tenantId,
          status: 'POSTED',
          ...(since ? { returnDate: { gte: since } } : {}),
        },
        include: {
          invoice: { select: { currency: true, exchangeRate: true } },
          items: { select: { vatAmount: true } },
        },
      }),
      this.prisma.counterpartyBalance.findMany({
        where: { tenantId },
        select: {
          counterpartyId: true,
          currency: true,
          customerDebt: true,
          supplierDebt: true,
        },
      }),
      this.prisma.productBatch.findMany({
        where: { tenantId, remainingQty: { gt: 0 } },
        select: { remainingQty: true, landedCost: true },
      }),
    ]);

    const revenueByCurrencyMap: Record<string, number> = {};
    let totalNetRevenueUzs = 0;
    let grossProfit = 0;
    let totalCogsUzs = 0;
    for (const invoice of invoices) {
      const invoiceCurrency = invoice.currency;
      const rate = toUzsRate(
        invoiceCurrency,
        invoice.exchangeRate,
        'Posted sales invoice',
      );
      const amount = Number(invoice.totalAmount);
      const netRevenue = amount - Number(invoice.vatAmount || 0);
      revenueByCurrencyMap[invoiceCurrency] =
        (revenueByCurrencyMap[invoiceCurrency] || 0) + amount;
      totalNetRevenueUzs += netRevenue * rate;
      grossProfit += Number(invoice.grossProfit || 0);
      totalCogsUzs += Number(invoice.totalCogs || 0);
    }
    for (const salesReturn of returns) {
      const currency = salesReturn.currency;
      const rate = toUzsRate(
        currency,
        salesReturn.invoice?.exchangeRate,
        'Posted sales return',
      );
      const amount = Number(salesReturn.totalAmount);
      const vat = salesReturn.items.reduce(
        (sum, item) => sum + Number(item.vatAmount || 0),
        0,
      );
      const netRevenue = amount - vat;
      const cogs = Number(salesReturn.totalCogs || 0);
      revenueByCurrencyMap[currency] =
        (revenueByCurrencyMap[currency] || 0) - amount;
      totalNetRevenueUzs -= netRevenue * rate;
      grossProfit -= netRevenue * rate - cogs;
      totalCogsUzs -= cogs;
    }
    const totalRevenueByCurrency = Object.entries(revenueByCurrencyMap)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount]) => ({ currency, amount }));
    const totalRevenue =
      totalRevenueByCurrency.length === 1
        ? totalRevenueByCurrency[0].amount
        : 0;
    const grossProfitByCurrency =
      invoices.length > 0 || returns.length > 0
        ? [{ currency: 'UZS', amount: Math.round(grossProfit * 100) / 100 }]
        : [];
    const netProfitMargin =
      totalNetRevenueUzs > 0 ? (grossProfit / totalNetRevenueUzs) * 100 : 0;

    let totalAccountsReceivable = 0;
    let totalAccountsPayable = 0;
    const receivablesByCurr: Record<string, number> = {};
    const payablesByCurr: Record<string, number> = {};
    const customerAdvancesByCurr: Record<string, number> = {};
    const supplierAdvancesByCurr: Record<string, number> = {};

    balances.forEach((balance) => {
      const customerDebt = Number(balance.customerDebt);
      const supplierDebt = Number(balance.supplierDebt);
      const netBalance = customerDebt - supplierDebt;
      if (netBalance > 0) {
        receivablesByCurr[balance.currency] =
          (receivablesByCurr[balance.currency] || 0) + netBalance;
      } else if (netBalance < 0) {
        payablesByCurr[balance.currency] =
          (payablesByCurr[balance.currency] || 0) + Math.abs(netBalance);
      }
      if (customerDebt < 0) {
        customerAdvancesByCurr[balance.currency] =
          (customerAdvancesByCurr[balance.currency] || 0) +
          Math.abs(customerDebt);
      }
      if (supplierDebt < 0) {
        supplierAdvancesByCurr[balance.currency] =
          (supplierAdvancesByCurr[balance.currency] || 0) +
          Math.abs(supplierDebt);
      }
    });

    const receivablesByCurrency = Object.entries(receivablesByCurr).map(
      ([curr, amount]) => ({ currency: curr, amount }),
    );
    const payablesByCurrency = Object.entries(payablesByCurr).map(
      ([curr, amount]) => ({ currency: curr, amount }),
    );
    const customerAdvancesByCurrency = Object.entries(
      customerAdvancesByCurr,
    ).map(([curr, amount]) => ({ currency: curr, amount }));
    const supplierAdvancesByCurrency = Object.entries(
      supplierAdvancesByCurr,
    ).map(([curr, amount]) => ({ currency: curr, amount }));
    if (receivablesByCurrency.length === 1)
      totalAccountsReceivable = receivablesByCurrency[0].amount;
    if (payablesByCurrency.length === 1)
      totalAccountsPayable = payablesByCurrency[0].amount;

    const inventoryValuation = round2(
      batches.reduce(
        (sum, batch) =>
          sum + Number(batch.remainingQty) * Number(batch.landedCost),
        0,
      ),
    );
    const reportCurrency =
      totalRevenueByCurrency.length === 1
        ? totalRevenueByCurrency[0].currency
        : 'UZS';

    return {
      currency: reportCurrency,
      totalRevenue,
      totalRevenueByCurrency,
      grossProfit: round2(grossProfit),
      grossProfitByCurrency,
      totalCogs: round2(totalCogsUzs),
      netProfitMargin: Math.round(netProfitMargin * 10) / 10,
      totalAccountsReceivable,
      totalAccountsPayable,
      inventoryValuation,
      inventoryCurrency: 'UZS' as const,
      receivablesByCurrency,
      payablesByCurrency,
      customerAdvancesByCurrency,
      supplierAdvancesByCurrency,
    };
  }

  /** Posted invoices of the period with their rate to UZS. */
  private async postedInvoices(tenantId: string, range?: string) {
    const since = analyticsRangeStart(range);
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        tenantId,
        status: 'POSTED',
        ...(since ? { invoiceDate: { gte: since } } : {}),
      },
      select: {
        id: true,
        invoiceDate: true,
        totalAmount: true,
        vatAmount: true,
        totalCogs: true,
        currency: true,
        exchangeRate: true,
        counterparty: { select: { id: true, name: true, inn: true } },
      },
      orderBy: { invoiceDate: 'asc' },
    });
    return invoices.map((invoice) => ({
      ...invoice,
      rate: toUzsRate(
        invoice.currency,
        invoice.exchangeRate,
        'Posted sales invoice',
      ),
    }));
  }

  /** Monthly revenue, COGS and profit of posted invoices, in UZS. */
  async getSalesTrend(tenantId: string, range?: string) {
    const invoices = await this.postedInvoices(tenantId, range);
    const monthMap: Record<
      string,
      { revenue: number; cogs: number; profit: number }
    > = {};

    for (const inv of invoices) {
      const date = new Date(inv.invoiceDate);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      monthMap[monthKey] ??= { revenue: 0, cogs: 0, profit: 0 };
      const revenue = Number(inv.totalAmount) * inv.rate;
      const netRevenue =
        (Number(inv.totalAmount) - Number(inv.vatAmount || 0)) * inv.rate;
      const cogs = Number(inv.totalCogs || 0);
      monthMap[monthKey].revenue += revenue;
      monthMap[monthKey].cogs += cogs;
      monthMap[monthKey].profit += netRevenue - cogs;
    }

    return Object.keys(monthMap).map((period) => ({
      period,
      currency: 'UZS' as const,
      revenue: round2(monthMap[period].revenue),
      cogs: round2(monthMap[period].cogs),
      profit: round2(monthMap[period].profit),
    }));
  }

  /** Posted invoice lines of the period with their rate to UZS. */
  private async postedInvoiceItems(tenantId: string, range?: string) {
    const since = analyticsRangeStart(range);
    const items = await this.prisma.salesInvoiceItem.findMany({
      where: {
        invoice: {
          tenantId,
          status: 'POSTED',
          ...(since ? { invoiceDate: { gte: since } } : {}),
        },
      },
      include: {
        invoice: { select: { currency: true, exchangeRate: true } },
        product: { include: { category: true } },
      },
    });
    return items.map((item) => ({
      ...item,
      revenueUzs:
        Number(item.totalPrice) *
        toUzsRate(
          item.invoice.currency,
          item.invoice.exchangeRate,
          'Posted sales invoice',
        ),
    }));
  }

  async getCategoryBreakdown(tenantId: string, range?: string) {
    const invoiceItems = await this.postedInvoiceItems(tenantId, range);

    const catMap: Record<
      string,
      { categoryId: string; categoryName: any; revenue: number }
    > = {};
    let totalRevenue = 0;

    for (const item of invoiceItems) {
      const cat = item.product?.category;
      const catId = cat ? cat.id : 'uncategorized';
      catMap[catId] ??= {
        categoryId: catId,
        categoryName: cat
          ? cat.name
          : { uz: 'Kategoriyasiz', ru: 'Без категории' },
        revenue: 0,
      };
      catMap[catId].revenue += item.revenueUzs;
      totalRevenue += item.revenueUzs;
    }

    return Object.values(catMap)
      .sort((a, b) => b.revenue - a.revenue)
      .map((c) => ({
        ...c,
        currency: 'UZS' as const,
        revenue: round2(c.revenue),
        percentage:
          totalRevenue > 0 ? Math.round((c.revenue / totalRevenue) * 100) : 0,
      }));
  }

  async getTopProducts(tenantId: string, limit = 10, range?: string) {
    const invoiceItems = await this.postedInvoiceItems(tenantId, range);

    const prodMap: Record<
      string,
      {
        productId: string;
        productName: any;
        sku: string;
        unitOfMeasure: string;
        totalQuantity: number;
        totalRevenue: number;
      }
    > = {};

    for (const item of invoiceItems) {
      const p = item.product;
      if (!p) continue;
      prodMap[p.id] ??= {
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        unitOfMeasure: p.unitOfMeasure,
        totalQuantity: 0,
        totalRevenue: 0,
      };
      prodMap[p.id].totalQuantity += Number(item.quantity);
      prodMap[p.id].totalRevenue += item.revenueUzs;
    }

    return Object.values(prodMap)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit)
      .map((p) => ({
        ...p,
        currency: 'UZS' as const,
        totalRevenue: round2(p.totalRevenue),
      }));
  }

  async getTopClients(tenantId: string, limit = 5, range?: string) {
    const invoices = await this.postedInvoices(tenantId, range);

    const clientMap: Record<
      string,
      {
        counterpartyId: string;
        name: string;
        inn: string | null;
        totalSpent: number;
        invoiceCount: number;
      }
    > = {};

    for (const inv of invoices) {
      const c = inv.counterparty;
      if (!c) continue;
      clientMap[c.id] ??= {
        counterpartyId: c.id,
        name: c.name,
        inn: c.inn,
        totalSpent: 0,
        invoiceCount: 0,
      };
      clientMap[c.id].totalSpent += Number(inv.totalAmount) * inv.rate;
      clientMap[c.id].invoiceCount += 1;
    }

    return Object.values(clientMap)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit)
      .map((c) => ({
        ...c,
        currency: 'UZS' as const,
        totalSpent: round2(c.totalSpent),
      }));
  }

  /**
   * Ratios for the calendar year so far, in UZS. A ratio that cannot be
   * computed honestly is null (shown as "—"), never a made-up default:
   * - working capital needs every debt in UZS (a USD debt has no rate here);
   * - inventory days need COGS;
   * - AR days need receivables and revenue in the same single currency.
   */
  async getFinancialRatios(tenantId: string) {
    const kpi = await this.getKpiSummary(tenantId, 'year');
    const dayOfYear =
      Math.floor(
        (Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) /
          86_400_000,
      ) + 1;

    const debtsInUzsOnly = [
      ...kpi.receivablesByCurrency,
      ...kpi.payablesByCurrency,
    ].every((debt) => debt.currency === 'UZS');
    const workingCapital = debtsInUzsOnly
      ? round2(
          kpi.inventoryValuation +
            kpi.totalAccountsReceivable -
            kpi.totalAccountsPayable,
        )
      : null;

    const inventoryTurnoverDays =
      kpi.totalCogs > 0
        ? Math.round((kpi.inventoryValuation / kpi.totalCogs) * dayOfYear)
        : null;

    const revenue = kpi.totalRevenueByCurrency;
    const receivables = kpi.receivablesByCurrency;
    const arCollectionDays =
      receivables.length === 0
        ? 0
        : revenue.length === 1 &&
            receivables.length === 1 &&
            revenue[0].currency === receivables[0].currency &&
            revenue[0].amount > 0
          ? Math.round((receivables[0].amount / revenue[0].amount) * dayOfYear)
          : null;

    return {
      currency: 'UZS' as const,
      workingCapital,
      inventoryTurnoverDays,
      arCollectionDays,
    };
  }
}
