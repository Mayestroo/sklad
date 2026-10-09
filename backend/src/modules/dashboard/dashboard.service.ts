import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { SalesDocStatus, TransactionDirection, TransactionStatus } from '@prisma/client';
import type { FinanceSummaryByAccount } from '../../../../shared/types/finance';
import { convertAmountToUzs } from '../../common/utils/transaction-exchange-rate';

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
    const from = filters.date_from
      ? new Date(filters.date_from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = filters.date_to ? new Date(filters.date_to + 'T23:59:59Z') : now;
    return { from, to };
  }

  // ─── /api/dashboard ──────────────────────────────────────────────

  async getFullDashboard(tenantId: string, filters: DashboardFilters) {
    const [finance, sales, debts, cashFlow, recentTransactions] =
      await Promise.all([
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
      status: TransactionStatus.POSTED,
      transactionDate: { gte: from, lte: to },
    };

    // Finance transactions: income and expense only (not transfer)
    const transactions = await this.prisma.financeTransaction.findMany({
      where: {
        ...whereBase,
        ...(filters.currency
          ? {
              OR: [
                { currency: filters.currency },
                {
                  direction: TransactionDirection.TRANSFER,
                  transferToAccount: { is: { currency: filters.currency } },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        direction: true,
        amount: true,
        currency: true,
        accountId: true,
        account: { select: { id: true, accountType: true, name: true, currency: true } },
        transferToId: true,
        transferToAmount: true,
        transferToAccount: { select: { id: true, accountType: true, name: true, currency: true } },
      },
    });

    // Group by currency
    const byCurrency: Record<string, { income: number; expense: number }> = {};
    const byAccount = new Map<string, FinanceSummaryByAccount>();

    const accountSummary = (account: NonNullable<typeof transactions[number]['account']>) => {
      let summary = byAccount.get(account.id);
      if (!summary) {
        summary = {
          accountId: account.id,
          accountType: account.accountType,
          name: account.name as { uz: string; ru: string },
          currency: account.currency,
          totalIncome: 0,
          totalExpense: 0,
          transferIn: 0,
          transferOut: 0,
          netCashFlow: 0,
        };
        byAccount.set(account.id, summary);
      }
      return summary;
    };

    for (const tx of transactions) {
      if (!tx.accountId || !tx.account || tx.account.currency !== tx.currency) {
        throw new Error('Dashboard finance transaction has missing or mismatched source-account currency');
      }
      const amount = Number(tx.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Dashboard finance transaction amount must be positive and finite');
      }
      if (tx.direction === TransactionDirection.TRANSFER) {
        if (!tx.transferToId || !tx.transferToAccount) {
          throw new Error('Dashboard finance transfer has no destination account');
        }
        if (tx.transferToAmount == null || !Number.isFinite(Number(tx.transferToAmount)) || Number(tx.transferToAmount) <= 0) {
          throw new Error('Dashboard finance transfer destination amount must be positive and finite');
        }
        const source = !filters.currency || tx.account.currency === filters.currency
          ? accountSummary(tx.account)
          : undefined;
        const target = !filters.currency || tx.transferToAccount.currency === filters.currency
          ? accountSummary(tx.transferToAccount)
          : undefined;
        if (source) {
          source.transferOut += amount;
        }
        if (target) {
          target.transferIn += Number(tx.transferToAmount);
        }
        continue;
      }
      if (!byCurrency[tx.currency])
        byCurrency[tx.currency] = { income: 0, expense: 0 };
      if (filters.currency && tx.currency !== filters.currency) continue;
      const account = accountSummary(tx.account);
      if (tx.direction === TransactionDirection.INCOME) {
        byCurrency[tx.currency].income += amount;
        account.totalIncome += amount;
      } else {
        byCurrency[tx.currency].expense += amount;
        account.totalExpense += amount;
      }
    }

    for (const account of byAccount.values()) {
      account.netCashFlow = account.totalIncome + account.transferIn - account.totalExpense - account.transferOut;
    }

    const summaryByCurrency = Object.entries(byCurrency).map(
      ([currency, d]) => ({
        currency,
        totalIncome: d.income,
        totalExpense: d.expense,
        netCashFlow: d.income - d.expense,
      }),
    );

    // Account balances
    const accounts = await this.prisma.cashAccount.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        accountType: true,
        name: true,
        currency: true,
        balance: true,
      },
    });

    for (const account of accounts) {
      if (filters.currency && account.currency !== filters.currency) continue;
      if (!byAccount.has(account.id)) {
        byAccount.set(account.id, {
          accountId: account.id,
          accountType: account.accountType,
          name: account.name as { uz: string; ru: string },
          currency: account.currency,
          totalIncome: 0,
          totalExpense: 0,
          transferIn: 0,
          transferOut: 0,
          netCashFlow: 0,
        });
      }
    }

    const accountOrder: Record<string, number> = { UZS_CASH: 0, USD_CASH: 1, BANK: 2 };
    const summaryByAccount = Array.from(byAccount.values()).sort((left, right) => {
      return (accountOrder[left.accountType ?? ''] ?? 3) - (accountOrder[right.accountType ?? ''] ?? 3)
        || left.currency.localeCompare(right.currency)
        || (left.accountId ?? '').localeCompare(right.accountId ?? '');
    });

    // Profit: gross = sales - COGS
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        tenantId,
        status: SalesDocStatus.POSTED,
        invoiceDate: { gte: from, lte: to },
        ...(filters.currency ? { currency: filters.currency } : {}),
      },
      select: { totalAmount: true, totalCogs: true, grossProfit: true, currency: true, exchangeRate: true },
    });

    let totalRevenue = 0;
    let totalCogs = 0;
    let grossProfit = 0;
    invoices.forEach((inv) => {
      totalRevenue += convertAmountToUzs(
        Number(inv.totalAmount),
        inv.currency,
        Number(inv.exchangeRate),
      );
      totalCogs += Number(inv.totalCogs);
      grossProfit += Number(inv.grossProfit);
    });

    return {
      summaryByCurrency,
      summaryByAccount,
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
      where: {
        tenantId,
        status: SalesDocStatus.POSTED,
        invoiceDate: { gte: from, lte: to },
        ...(filters.currency ? { currency: filters.currency } : {}),
      },
      select: {
        id: true,
        invoiceDate: true,
        totalAmount: true,
        status: true,
        currency: true,
        exchangeRate: true,
      },
    });

    const salesByCurr: Record<string, number> = {};
    let totalSales = 0;
    invoices.forEach((inv) => {
      const amt = Number(inv.totalAmount);
      const curr = inv.currency;
      salesByCurr[curr] = (salesByCurr[curr] || 0) + amt;
      totalSales += convertAmountToUzs(amt, curr, Number(inv.exchangeRate));
    });

    const byCurrency = Object.entries(salesByCurr).map(([currency, amount]) => ({ currency, amount }));

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
      dynamicsMap[key] = (dynamicsMap[key] ?? 0) + convertAmountToUzs(
        Number(inv.totalAmount),
        inv.currency,
        Number(inv.exchangeRate),
      );
    });

    const dynamics = Object.entries(dynamicsMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, amount]) => ({ period, amount }));

    return { totalSales, invoiceCount: invoices.length, byCurrency, dynamics };
  }

  // ─── /api/dashboard/debts ────────────────────────────────────────

  async getDebts(tenantId: string) {
    const balances = await this.prisma.counterpartyBalance.findMany({
      where: { tenantId },
      include: { counterparty: { select: { name: true } } },
    });

    const debtors: Array<{ id: string; name: string; amount: number; currency: string }> = [];
    const creditors: Array<{ id: string; name: string; amount: number; currency: string }> = [];
    const debtorMap = new Map<string, typeof debtors[number]>();
    const creditorMap = new Map<string, typeof creditors[number]>();
    const receivableByCurr: Record<string, number> = {};
    const payableByCurr: Record<string, number> = {};
    const customerAdvancesByCurr: Record<string, number> = {};
    const supplierAdvancesByCurr: Record<string, number> = {};
    for (const balance of balances) {
      const customerDebt = Number(balance.customerDebt);
      const supplierDebt = Number(balance.supplierDebt);
      const netBalance = customerDebt - supplierDebt;
      const key = `${balance.counterpartyId}:${balance.currency}`;
      if (netBalance > 0) {
        debtorMap.set(key, {
          id: balance.counterpartyId,
          name: balance.counterparty.name,
          currency: balance.currency,
          amount: netBalance,
        });
        receivableByCurr[balance.currency] = (receivableByCurr[balance.currency] || 0) + netBalance;
      } else if (netBalance < 0) {
        creditorMap.set(key, {
          id: balance.counterpartyId,
          name: balance.counterparty.name,
          currency: balance.currency,
          amount: Math.abs(netBalance),
        });
        payableByCurr[balance.currency] = (payableByCurr[balance.currency] || 0) + Math.abs(netBalance);
      }
      if (customerDebt < 0) {
        customerAdvancesByCurr[balance.currency] = (customerAdvancesByCurr[balance.currency] || 0) + Math.abs(customerDebt);
      }
      if (supplierDebt < 0) {
        supplierAdvancesByCurr[balance.currency] = (supplierAdvancesByCurr[balance.currency] || 0) + Math.abs(supplierDebt);
      }
    }
    debtors.push(...debtorMap.values());
    creditors.push(...creditorMap.values());

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const receivableByCurrency = Object.entries(receivableByCurr).map(([currency, amount]) => ({ currency, amount }));
    const payableByCurrency = Object.entries(payableByCurr).map(([currency, amount]) => ({ currency, amount }));
    const customerAdvancesByCurrency = Object.entries(customerAdvancesByCurr).map(([currency, amount]) => ({ currency, amount }));
    const supplierAdvancesByCurrency = Object.entries(supplierAdvancesByCurr).map(([currency, amount]) => ({ currency, amount }));
    const receivableTotal = receivableByCurrency.length === 1 ? receivableByCurrency[0].amount : 0;
    const payableTotal = payableByCurrency.length === 1 ? payableByCurrency[0].amount : 0;

    return {
      receivable: {
        total: receivableTotal,
        count: debtors.length,
        byCurrency: receivableByCurrency,
        advancesByCurrency: customerAdvancesByCurrency,
        topDebtors: debtors.slice(0, 5),
      },
      payable: {
        total: payableTotal,
        count: creditors.length,
        byCurrency: payableByCurrency,
        advancesByCurrency: supplierAdvancesByCurrency,
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
        status: TransactionStatus.POSTED,
        direction: {
          in: [TransactionDirection.INCOME, TransactionDirection.EXPENSE],
        },
        transactionDate: { gte: from, lte: to },
        ...(filters.currency ? { currency: filters.currency } : {}),
      },
      select: {
        direction: true,
        amount: true,
        currency: true,
        transactionDate: true,
      },
    });

    // Group by currency → then by period
    const byCurrency: Record<
      string,
      Record<string, { income: number; expense: number }>
    > = {};

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

      if (!byCurrency[currency][key])
        byCurrency[currency][key] = { income: 0, expense: 0 };
      if (tx.direction === TransactionDirection.INCOME) {
        byCurrency[currency][key].income += Number(tx.amount);
      } else {
        byCurrency[currency][key].expense += Number(tx.amount);
      }
    });

    const seriesByCurrency = Object.entries(byCurrency).map(
      ([currency, periodMap]) => ({
        currency,
        series: Object.entries(periodMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([period, data]) => ({ period, ...data })),
      }),
    );

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

  // ─── /api/dashboard/sales-orders ─────────────────────────────────

  async getSalesOrderStats(tenantId: string) {
    const [statusCounts, deadlineOrders, inflightAgg] = await Promise.all([
      this.prisma.salesOrder.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.salesOrder.findMany({
        where: {
          tenantId,
          deliveryDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          status: {
            notIn: ['SHIPPED', 'COMPLETED', 'CANCELLED'] as any[],
          },
        },
        include: { counterparty: { select: { id: true, name: true } } },
        orderBy: { deliveryDate: 'asc' },
        take: 20,
      }),
      this.prisma.salesOrder.aggregate({
        where: {
          tenantId,
          status: { notIn: ['CANCELLED', 'COMPLETED'] as any[] },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const sc of statusCounts) {
      counts[sc.status] = sc._count._all;
    }

    return {
      pipeline: {
        NEW: counts['NEW'] || 0,
        PENDING_APPROVAL: counts['PENDING_APPROVAL'] || 0,
        APPROVED: counts['APPROVED'] || 0,
        SENT_TO_PRODUCTION: counts['SENT_TO_PRODUCTION'] || 0,
        IN_PRODUCTION: counts['IN_PRODUCTION'] || 0,
        PARTIALLY_READY: counts['PARTIALLY_READY'] || 0,
        READY: counts['READY'] || 0,
        AWAITING_PAYMENT: counts['AWAITING_PAYMENT'] || 0,
        PAYMENT_CONFIRMED: counts['PAYMENT_CONFIRMED'] || 0,
        READY_TO_SHIP: counts['READY_TO_SHIP'] || 0,
        SHIPPED: counts['SHIPPED'] || 0,
        COMPLETED: counts['COMPLETED'] || 0,
        CANCELLED: counts['CANCELLED'] || 0,
      },
      upcomingDeadlines: deadlineOrders,
      totalInflightAmount: Number(inflightAgg._sum.totalAmount || 0),
    };
  }
}
