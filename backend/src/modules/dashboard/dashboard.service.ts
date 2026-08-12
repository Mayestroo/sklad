import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { TransactionDirection } from '@prisma/client';

interface DashboardFilters {
  date_from?: string;
  date_to?: string;
  currency?: string;
  granularity?: 'day' | 'week' | 'month';
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private dateRange(filters: DashboardFilters) {
    const now = new Date();
    const from = filters.date_from ? new Date(filters.date_from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = filters.date_to ? new Date(filters.date_to + 'T23:59:59Z') : now;
    return { from, to };
  }

  // ─── /api/dashboard ──────────────────────────────────────────────

  async getFullDashboard(tenantId: string, filters: DashboardFilters) {
    const [finance, sales, debts, cashFlow, recentTransactions] = await Promise.all([
      this.getFinanceKPIs(tenantId, filters),
      this.getSalesKPIs(tenantId, filters),
      this.getDebts(tenantId),
      this.getCashFlow(tenantId, filters),
      this.getRecentTransactions(tenantId, 10),
    ]);

    return { finance, sales, debts, cashFlow, recentTransactions };
  }

  // ─── /api/dashboard/finance ──────────────────────────────────────

  async getFinanceKPIs(tenantId: string, filters: DashboardFilters) {
    const { from, to } = this.dateRange(filters);

    const whereBase: any = {
      tenantId,
      isDeleted: false,
      transactionDate: { gte: from, lte: to },
    };

    if (filters.currency) whereBase.currency = filters.currency;

    // Finance transactions: income and expense only (not transfer)
    const transactions = await this.prisma.financeTransaction.findMany({
      where: {
        ...whereBase,
        direction: { in: [TransactionDirection.INCOME, TransactionDirection.EXPENSE] },
      },
      select: { direction: true, amount: true, currency: true },
    });

    // Group by currency
    const byCurrency: Record<string, { income: number; expense: number }> = {};
    for (const tx of transactions) {
      if (!byCurrency[tx.currency]) byCurrency[tx.currency] = { income: 0, expense: 0 };
      if (tx.direction === TransactionDirection.INCOME) {
        byCurrency[tx.currency].income += Number(tx.amount);
      } else {
        byCurrency[tx.currency].expense += Number(tx.amount);
      }
    }

    const summaryByCurrency = Object.entries(byCurrency).map(([currency, d]) => ({
      currency,
      totalIncome: d.income,
      totalExpense: d.expense,
      netCashFlow: d.income - d.expense,
    }));

    // Account balances
    const accounts = await this.prisma.cashAccount.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, accountType: true, name: true, currency: true, balance: true },
    });

    // Profit: gross = sales - COGS
    const invoices = await this.prisma.salesInvoice.findMany({
      where: { tenantId, invoiceDate: { gte: from, lte: to } },
      include: { items: { include: { product: true } } },
    });

    let totalRevenue = 0;
    let totalCogs = 0;
    invoices.forEach((inv) => {
      totalRevenue += Number(inv.totalAmount);
      inv.items.forEach((item) => {
        totalCogs += Number(item.quantity) * (Number(item.product?.costPrice) || 0);
      });
    });

    const grossProfit = totalRevenue - totalCogs;

    return {
      summaryByCurrency,
      accounts: accounts.map((a) => ({ ...a, balance: Number(a.balance) })),
      profit: {
        grossProfit,
        netProfit: grossProfit, // operating expenses deduction to be added in Phase 3
        revenue: totalRevenue,
        cogs: totalCogs,
      },
    };
  }

  // ─── /api/dashboard/sales ────────────────────────────────────────

  async getSalesKPIs(tenantId: string, filters: DashboardFilters) {
    const { from, to } = this.dateRange(filters);

    const invoices = await this.prisma.salesInvoice.findMany({
      where: { tenantId, invoiceDate: { gte: from, lte: to } },
      select: { id: true, invoiceDate: true, totalAmount: true, status: true },
    });

    const totalSales = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);

    // Sales dynamics by granularity
    const granularity = filters.granularity ?? 'day';
    const dynamicsMap: Record<string, number> = {};
    invoices.forEach((inv) => {
      const d = new Date(inv.invoiceDate);
      let key: string;
      if (granularity === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else if (granularity === 'week') {
        // ISO week
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = startOfWeek.toISOString().slice(0, 10);
      } else {
        key = d.toISOString().slice(0, 10);
      }
      dynamicsMap[key] = (dynamicsMap[key] ?? 0) + Number(inv.totalAmount);
    });

    const dynamics = Object.entries(dynamicsMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, amount]) => ({ period, amount }));

    return { totalSales, invoiceCount: invoices.length, dynamics };
  }

  // ─── /api/dashboard/debts ────────────────────────────────────────

  async getDebts(tenantId: string) {
    const counterparties = await this.prisma.counterparty.findMany({
      where: { tenantId },
      select: { id: true, name: true, type: true, debtBalance: true },
    });

    let totalReceivable = 0;
    let totalPayable = 0;
    const debtors: Array<{ id: string; name: string; amount: number }> = [];
    const creditors: Array<{ id: string; name: string; amount: number }> = [];

    counterparties.forEach((c) => {
      const debt = Number(c.debtBalance);
      if (debt > 0) {
        totalReceivable += debt;
        debtors.push({ id: c.id, name: c.name, amount: debt });
      } else if (debt < 0) {
        totalPayable += Math.abs(debt);
        creditors.push({ id: c.id, name: c.name, amount: Math.abs(debt) });
      }
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    return {
      receivable: {
        total: totalReceivable,
        count: debtors.length,
        topDebtors: debtors.slice(0, 5),
      },
      payable: {
        total: totalPayable,
        count: creditors.length,
        topCreditors: creditors.slice(0, 5),
      },
    };
  }

  // ─── /api/dashboard/cash-flow ────────────────────────────────────

  async getCashFlow(tenantId: string, filters: DashboardFilters) {
    const { from, to } = this.dateRange(filters);
    const granularity = filters.granularity ?? 'day';

    const transactions = await this.prisma.financeTransaction.findMany({
      where: {
        tenantId,
        isDeleted: false,
        direction: { in: [TransactionDirection.INCOME, TransactionDirection.EXPENSE] },
        transactionDate: { gte: from, lte: to },
        ...(filters.currency ? { currency: filters.currency } : {}),
      },
      select: { direction: true, amount: true, currency: true, transactionDate: true },
    });

    // Group by currency → then by period
    const byCurrency: Record<string, Record<string, { income: number; expense: number }>> = {};

    transactions.forEach((tx) => {
      const currency = tx.currency;
      if (!byCurrency[currency]) byCurrency[currency] = {};

      const d = new Date(tx.transactionDate);
      let key: string;
      if (granularity === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else if (granularity === 'week') {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = startOfWeek.toISOString().slice(0, 10);
      } else {
        key = d.toISOString().slice(0, 10);
      }

      if (!byCurrency[currency][key]) byCurrency[currency][key] = { income: 0, expense: 0 };
      if (tx.direction === TransactionDirection.INCOME) {
        byCurrency[currency][key].income += Number(tx.amount);
      } else {
        byCurrency[currency][key].expense += Number(tx.amount);
      }
    });

    const seriesByCurrency = Object.entries(byCurrency).map(([currency, periodMap]) => ({
      currency,
      series: Object.entries(periodMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, data]) => ({ period, ...data })),
    }));

    // Legacy flat series: UZS only (or first currency if no UZS)
    const uzsEntry = seriesByCurrency.find((e) => e.currency === 'UZS');
    const legacySeries = uzsEntry?.series ?? seriesByCurrency[0]?.series ?? [];

    return { seriesByCurrency, series: legacySeries, granularity };
  }

  // ─── /api/dashboard/transactions ─────────────────────────────────

  async getRecentTransactions(tenantId: string, limit = 10) {
    const transactions = await this.prisma.financeTransaction.findMany({
      where: { tenantId, isDeleted: false },
      include: {
        account: true,
        counterparty: { select: { id: true, name: true } },
        transactionType: true,
      },
      orderBy: { transactionDate: 'desc' },
      take: limit,
    });

    return transactions;
  }
}
