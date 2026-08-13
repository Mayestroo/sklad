import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getKpiSummary(tenantId: string) {
    const [invoices, counterparties, stockLevels] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: { tenantId },
        include: { items: { include: { product: true } } },
      }),
      this.prisma.counterparty.findMany({
        where: { tenantId },
      }),
      this.prisma.stockLevel.findMany({
        where: { tenantId },
        include: { product: true },
      }),
    ]);

    const totalRevenue = invoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount),
      0,
    );

    let totalCogs = 0;
    invoices.forEach((inv) => {
      inv.items.forEach((item) => {
        totalCogs +=
          Number(item.quantity) * (Number(item.product?.costPrice) || 0);
      });
    });

    const grossProfit = totalRevenue - totalCogs;
    const netProfitMargin =
      totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    let totalAccountsReceivable = 0;
    let totalAccountsPayable = 0;

    counterparties.forEach((c) => {
      const debt = Number(c.debtBalance);
      if (debt > 0) {
        totalAccountsReceivable += debt;
      } else if (debt < 0) {
        totalAccountsPayable += Math.abs(debt);
      }
    });

    const inventoryValuation = stockLevels.reduce(
      (sum, stock) =>
        sum + Number(stock.quantity) * (Number(stock.product?.costPrice) || 0),
      0,
    );

    return {
      totalRevenue,
      grossProfit,
      netProfitMargin: Math.round(netProfitMargin * 10) / 10,
      totalAccountsReceivable,
      totalAccountsPayable,
      inventoryValuation,
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
