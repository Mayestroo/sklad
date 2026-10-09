import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getKpiSummary(tenantId: string) {
    const [invoices, returns, balances, stockLevels] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: { tenantId, status: 'POSTED' },
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
        where: { tenantId, status: 'POSTED' },
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
      this.prisma.stockLevel.findMany({
        where: { tenantId },
        include: { product: true },
      }),
    ]);

    const revenueByCurrencyMap: Record<string, number> = {};
    let totalNetRevenueUzs = 0;
    let totalCogs = 0;
    let grossProfit = 0;
    for (const invoice of invoices) {
      const invoiceCurrency = invoice.currency;
      const rate = invoiceCurrency === 'UZS' ? 1 : Number(invoice.exchangeRate);
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new BadRequestException(`Posted sales invoice has an invalid ${invoiceCurrency} exchange rate`);
      }
      const amount = Number(invoice.totalAmount);
      const netRevenue = amount - Number(invoice.vatAmount || 0);
      revenueByCurrencyMap[invoiceCurrency] = (revenueByCurrencyMap[invoiceCurrency] || 0) + amount;
      totalNetRevenueUzs += netRevenue * rate;
      totalCogs += Number(invoice.totalCogs || 0);
      grossProfit += Number(invoice.grossProfit || 0);
    }
    for (const salesReturn of returns) {
      const currency = salesReturn.currency;
      const rate = currency === 'UZS' ? 1 : Number(salesReturn.invoice?.exchangeRate);
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new BadRequestException(`Posted sales return has an invalid ${currency} exchange rate`);
      }
      const amount = Number(salesReturn.totalAmount);
      const vat = salesReturn.items.reduce((sum, item) => sum + Number(item.vatAmount || 0), 0);
      const netRevenue = amount - vat;
      const cogs = Number(salesReturn.totalCogs || 0);
      revenueByCurrencyMap[currency] = (revenueByCurrencyMap[currency] || 0) - amount;
      totalNetRevenueUzs -= netRevenue * rate;
      totalCogs -= cogs;
      grossProfit -= netRevenue * rate - cogs;
    }
    const totalRevenueByCurrency = Object.entries(revenueByCurrencyMap)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount]) => ({ currency, amount }));
    const totalRevenue = totalRevenueByCurrency.length === 1 ? totalRevenueByCurrency[0].amount : 0;
    const grossProfitByCurrency = invoices.length > 0 || returns.length > 0
      ? [{ currency: 'UZS', amount: Math.round(grossProfit * 100) / 100 }]
      : [];
    const netProfitMargin = totalNetRevenueUzs > 0 ? (grossProfit / totalNetRevenueUzs) * 100 : 0;

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
        receivablesByCurr[balance.currency] = (receivablesByCurr[balance.currency] || 0) + netBalance;
      } else if (netBalance < 0) {
        payablesByCurr[balance.currency] = (payablesByCurr[balance.currency] || 0) + Math.abs(netBalance);
      }
      if (customerDebt < 0) {
        customerAdvancesByCurr[balance.currency] = (customerAdvancesByCurr[balance.currency] || 0) + Math.abs(customerDebt);
      }
      if (supplierDebt < 0) {
        supplierAdvancesByCurr[balance.currency] = (supplierAdvancesByCurr[balance.currency] || 0) + Math.abs(supplierDebt);
      }
    });

    const receivablesByCurrency = Object.entries(receivablesByCurr).map(([curr, amount]) => ({ currency: curr, amount }));
    const payablesByCurrency = Object.entries(payablesByCurr).map(([curr, amount]) => ({ currency: curr, amount }));
    const customerAdvancesByCurrency = Object.entries(customerAdvancesByCurr).map(([curr, amount]) => ({ currency: curr, amount }));
    const supplierAdvancesByCurrency = Object.entries(supplierAdvancesByCurr).map(([curr, amount]) => ({ currency: curr, amount }));
    if (receivablesByCurrency.length === 1) totalAccountsReceivable = receivablesByCurrency[0].amount;
    if (payablesByCurrency.length === 1) totalAccountsPayable = payablesByCurrency[0].amount;

    const inventoryValuation = stockLevels.reduce((sum, stock) =>
      sum + Number(stock.quantity) * Number(stock.product?.costPrice || 0) * Number(stock.product?.costPriceExchangeRate || 1),
    0);
    const reportCurrency = totalRevenueByCurrency.length === 1 ? totalRevenueByCurrency[0].currency : 'UZS';

    return {
      currency: reportCurrency,
      totalRevenue,
      totalRevenueByCurrency,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossProfitByCurrency,
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

  async getSalesTrend(tenantId: string) {
    const invoices = await this.prisma.salesInvoice.findMany({
      where: { tenantId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const monthMap: Record<
      string,
      { revenue: number; cogs: number; profit: number }
    > = {};

    invoices.forEach((inv) => {
      const date = new Date(inv.invoiceDate);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

      if (!monthMap[monthKey]) {
        monthMap[monthKey] = { revenue: 0, cogs: 0, profit: 0 };
      }

      const rev = Number(inv.totalAmount);
      let cogs = 0;
      inv.items.forEach((i) => {
        cogs += Number(i.quantity) * (Number(i.product?.costPrice) || 0);
      });

      monthMap[monthKey].revenue += rev;
      monthMap[monthKey].cogs += cogs;
      monthMap[monthKey].profit += rev - cogs;
    });

    const trend = Object.keys(monthMap).map((key) => ({
      period: key,
      ...monthMap[key],
    }));

    return trend;
  }

  async getCategoryBreakdown(tenantId: string) {
    const invoiceItems = await this.prisma.salesInvoiceItem.findMany({
      where: { invoice: { tenantId } },
      include: {
        product: { include: { category: true } },
      },
    });

    const catMap: Record<
      string,
      { categoryId: string; categoryName: any; revenue: number }
    > = {};
    let totalRevenue = 0;

    invoiceItems.forEach((item) => {
      const cat = item.product?.category;
      const catId = cat ? cat.id : 'uncategorized';
      const catName = cat
        ? cat.name
        : { uz: 'Kategoriyasiz', ru: 'Без категории' };

      if (!catMap[catId]) {
        catMap[catId] = {
          categoryId: catId,
          categoryName: catName,
          revenue: 0,
        };
      }

      const itemRev = Number(item.totalPrice);
      catMap[catId].revenue += itemRev;
      totalRevenue += itemRev;
    });

    return Object.values(catMap).map((c) => ({
      ...c,
      percentage:
        totalRevenue > 0 ? Math.round((c.revenue / totalRevenue) * 100) : 0,
    }));
  }

  async getTopProducts(tenantId: string, limit = 10) {
    const invoiceItems = await this.prisma.salesInvoiceItem.findMany({
      where: { invoice: { tenantId } },
      include: { product: true },
    });

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

    invoiceItems.forEach((item) => {
      const p = item.product;
      if (!p) return;

      if (!prodMap[p.id]) {
        prodMap[p.id] = {
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          unitOfMeasure: p.unitOfMeasure,
          totalQuantity: 0,
          totalRevenue: 0,
        };
      }

      prodMap[p.id].totalQuantity += Number(item.quantity);
      prodMap[p.id].totalRevenue += Number(item.totalPrice);
    });

    return Object.values(prodMap)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }

  async getTopClients(tenantId: string, limit = 5) {
    const invoices = await this.prisma.salesInvoice.findMany({
      where: { tenantId },
      include: { counterparty: true },
    });

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

    invoices.forEach((inv) => {
      const c = inv.counterparty;
      if (!c) return;

      if (!clientMap[c.id]) {
        clientMap[c.id] = {
          counterpartyId: c.id,
          name: c.name,
          inn: c.inn,
          totalSpent: 0,
          invoiceCount: 0,
        };
      }

      clientMap[c.id].totalSpent += Number(inv.totalAmount);
      clientMap[c.id].invoiceCount += 1;
    });

    return Object.values(clientMap)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit);
  }

  async getFinancialRatios(tenantId: string) {
    const kpi = await this.getKpiSummary(tenantId);

    // Working Capital = (Cash/Bank + Inventory + AR) - AP
    const workingCapital =
      kpi.inventoryValuation +
      kpi.totalAccountsReceivable -
      kpi.totalAccountsPayable;
    const inventoryTurnoverDays =
      kpi.grossProfit > 0
        ? Math.round(
            (kpi.inventoryValuation / (kpi.totalRevenue - kpi.grossProfit)) *
              365,
          )
        : 0;
    const arCollectionDays =
      kpi.totalRevenue > 0
        ? Math.round((kpi.totalAccountsReceivable / kpi.totalRevenue) * 365)
        : 0;

    return {
      workingCapital,
      inventoryTurnoverDays: Math.min(inventoryTurnoverDays || 30, 365),
      arCollectionDays: Math.min(arCollectionDays || 15, 365),
    };
  }
}
