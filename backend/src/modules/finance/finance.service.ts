import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import {
  Prisma,
  CashAccountType,
  TransactionDirection,
  TransactionStatus,
  SalesDocStatus,
  SalesPaymentStatus,
  PurchaseDocStatus,
  PurchasePaymentStatus,
  ServicePaymentStatus,
  ServiceActType,
  CounterpartySettlementSide,
  SettlementAllocationTarget,
} from '@prisma/client';
import { CreateIncomeDto } from './dto/create-income.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { FilterTransactionsDto } from './dto/filter-transactions.dto';
import { CancelTransactionDto } from './dto/cancel-transaction.dto';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../settlements/settlement-allocation.service';
import { isCashAccountCurrencyValid } from '../../../../shared/types/cash-account-policy';
import { requireExchangeRateForCurrency } from '../../common/utils/transaction-exchange-rate';
import type { FinanceAccountFlow, FinanceSummaryByAccount } from '../../../../shared/types/finance';

interface FinanceSettlementContext {
  side: CounterpartySettlementSide | null;
  targetType?: SettlementAllocationTarget;
  targetId?: string;
}

interface FifoSettlementTarget {
  targetType: SettlementAllocationTarget;
  targetId: string;
  side: CounterpartySettlementSide;
  effectiveAt: Date;
  openAmount: number;
}

type SettlementDirection = Exclude<TransactionDirection, 'TRANSFER'>;

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: CounterpartySettlementService,
    private readonly settlementAllocationService: SettlementAllocationService,
  ) {}

  // ─── Accounts ────────────────────────────────────────────────

  async getAccounts(tenantId: string) {
    return this.prisma.cashAccount.findMany({
      where: { tenantId, isActive: true },
      orderBy: { accountType: 'asc' },
    });
  }

  async ensureDefaultAccounts(tenantId: string) {
    const defaults = [
      {
        accountType: 'UZS_CASH' as const,
        name: { uz: 'Naqd kassa (UZS)', ru: 'Наличная касса (UZS)' },
        currency: 'UZS',
      },
      {
        accountType: 'USD_CASH' as const,
        name: { uz: 'Dollar kassa (USD)', ru: 'Долларовая касса (USD)' },
        currency: 'USD',
      },
      {
        accountType: 'BANK' as const,
        name: { uz: 'Hisobraqam (Bank)', ru: 'Расчетный счет (Банк)' },
        currency: 'UZS',
      },
    ];

    for (const d of defaults) {
      await this.prisma.cashAccount.upsert({
        where: {
          tenantId_accountType: { tenantId, accountType: d.accountType },
        },
        create: { tenantId, ...d },
        update: {},
      });
    }

    return this.getAccounts(tenantId);
  }

  // ─── Summary ─────────────────────────────────────────────────

  async getSummary(
    tenantId: string,
    filters: { date_from?: string; date_to?: string; currency?: string },
  ) {
    const where: any = {
      tenantId,
      isDeleted: false,
      status: TransactionStatus.POSTED,
    };

    if (filters.date_from || filters.date_to) {
      where.transactionDate = {};
      if (filters.date_from)
        where.transactionDate.gte = new Date(filters.date_from);
      if (filters.date_to)
        where.transactionDate.lte = new Date(filters.date_to + 'T23:59:59Z');
    }

    if (filters.currency) {
      where.OR = [
        { currency: filters.currency },
        {
          direction: TransactionDirection.TRANSFER,
          transferToAccount: { is: { currency: filters.currency } },
        },
      ];
    }

    const transactions = await this.prisma.financeTransaction.findMany({
      where,
      select: {
        accountId: true,
        account: { select: { id: true, accountType: true, name: true, currency: true } },
        transferToId: true,
        transferToAmount: true,
        transferToAccount: { select: { id: true, accountType: true, name: true, currency: true } },
        direction: true,
        amount: true,
        currency: true,
      },
    });

    const byCurrency: Record<string, { income: number; expense: number }> = {};
    const byAccount = new Map<string, FinanceSummaryByAccount>();

    const getAccountSummary = (
      accountId: string,
      account: { id: string; accountType: CashAccountType; name: Prisma.JsonValue; currency: string },
    ) => {
      let summary = byAccount.get(accountId);
      if (!summary) {
        const newSummary: FinanceSummaryByAccount = {
          accountId,
          accountType: account.accountType,
          name: account.name as { uz: string; ru: string },
          currency: account.currency,
          totalIncome: 0,
          totalExpense: 0,
          transferIn: 0,
          transferOut: 0,
          netCashFlow: 0,
        };
        byAccount.set(accountId, newSummary);
        return newSummary;
      }
      return summary;
    };

    for (const tx of transactions) {
      if (!tx.accountId || !tx.account) {
        throw new BadRequestException('Finance transaction is missing its source cash/bank account');
      }
      if (tx.account.currency !== tx.currency) {
        throw new BadRequestException('Finance transaction currency does not match its source cash/bank account');
      }
      const transactionAmount = Number(tx.amount);
      if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) {
        throw new BadRequestException('Finance transaction amount must be a positive finite value');
      }
      const sourceSummary = !filters.currency || tx.account.currency === filters.currency
        ? getAccountSummary(tx.accountId, tx.account)
        : undefined;
      if (tx.direction === TransactionDirection.TRANSFER) {
        if (sourceSummary) sourceSummary.transferOut += transactionAmount;
        const targetAccountId = tx.transferToId;
        if (!targetAccountId) {
          throw new BadRequestException('Finance transfer is missing its destination cash/bank account');
        }
        if (!tx.transferToAccount) {
          throw new BadRequestException('Finance transfer is missing its destination cash/bank account');
        }
        const targetSummary = getAccountSummary(targetAccountId, tx.transferToAccount);
        const includeTarget = !filters.currency || targetSummary.currency === filters.currency;
        if (tx.transferToAmount == null || !Number.isFinite(Number(tx.transferToAmount)) || Number(tx.transferToAmount) <= 0) {
          throw new BadRequestException('Finance transfer destination amount must be a positive finite value');
        }
        if (includeTarget) {
          targetSummary.transferIn += Number(tx.transferToAmount);
        }
        continue;
      }

      if (!byCurrency[tx.currency])
        byCurrency[tx.currency] = { income: 0, expense: 0 };
      const transactionAccountSummary = sourceSummary ?? getAccountSummary(tx.accountId, tx.account);
      if (tx.direction === TransactionDirection.INCOME) {
        byCurrency[tx.currency].income += transactionAmount;
        transactionAccountSummary.totalIncome += transactionAmount;
      } else {
        byCurrency[tx.currency].expense += transactionAmount;
        transactionAccountSummary.totalExpense += transactionAmount;
      }
    }

    const summaryByCurrency = Object.entries(byCurrency).map(
      ([currency, data]) => ({
        currency,
        totalIncome: data.income,
        totalExpense: data.expense,
        netCashFlow: data.income - data.expense,
      }),
    );

    const accounts = await this.getAccounts(tenantId);
    const reportingAccounts = filters.currency
      ? accounts.filter((account) => account.currency === filters.currency)
      : accounts;
    const summaryByAccount: FinanceSummaryByAccount[] = reportingAccounts.map((account) => {
      const totals = byAccount.get(account.id);
      const totalIncome = totals?.totalIncome ?? 0;
      const totalExpense = totals?.totalExpense ?? 0;
      return {
        accountId: account.id,
        accountType: account.accountType,
        name: account.name as { uz: string; ru: string },
        currency: account.currency,
        totalIncome,
        totalExpense,
        transferIn: totals?.transferIn ?? 0,
        transferOut: totals?.transferOut ?? 0,
        netCashFlow: totalIncome + (totals?.transferIn ?? 0) - totalExpense - (totals?.transferOut ?? 0),
      };
    });
    for (const [key, totals] of byAccount) {
      if (totals.accountId && reportingAccounts.some((account) => account.id === totals.accountId)) continue;
      if (filters.currency && totals.currency !== filters.currency) continue;
      summaryByAccount.push({
        ...totals,
        netCashFlow: totals.totalIncome + totals.transferIn - totals.totalExpense - totals.transferOut,
      });
    }

    return {
      summaryByCurrency,
      summaryByAccount,
      accounts: accounts.map((a) => ({
        id: a.id,
        accountType: a.accountType,
        name: a.name,
        currency: a.currency,
        balance: Number(a.balance),
      })),
    };
  }

  // ─── Dashboard Metrics ───────────────────────────────────────

  async getDashboardMetrics(tenantId: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Accounts
    const accounts = await this.getAccounts(tenantId);
    let dollarKassa = 0;
    let naqdKassa = 0;
    let hisobRaqam = 0;
    const accountCurrencies = {
      dollarKassa: 'USD',
      naqdKassa: 'UZS',
      hisobRaqam: 'UZS',
    };
    const liquidByCurrency = new Map<string, number>();

    for (const acc of accounts) {
      const bal = Number(acc.balance || 0);
      if (acc.accountType === 'USD_CASH') {
        dollarKassa += bal;
        accountCurrencies.dollarKassa = acc.currency;
      } else if (acc.accountType === 'UZS_CASH') {
        naqdKassa += bal;
        accountCurrencies.naqdKassa = acc.currency;
      } else if (acc.accountType === 'BANK') {
        hisobRaqam += bal;
        accountCurrencies.hisobRaqam = acc.currency;
      }
      liquidByCurrency.set(acc.currency, (liquidByCurrency.get(acc.currency) ?? 0) + bal);
    }
    const totalLiquidByCurrency = Array.from(liquidByCurrency)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount]) => ({ currency, amount }));

    // Today's and Monthly transactions
    const txs = await this.prisma.financeTransaction.findMany({
      where: {
        tenantId,
        isDeleted: false,
        status: TransactionStatus.POSTED,
        transactionDate: { gte: startOfMonth },
      },
      select: {
        accountId: true,
        account: {
          select: {
            id: true,
            accountType: true,
            name: true,
            currency: true,
          },
        },
        transferToId: true,
        transferToAmount: true,
        transferToAccount: {
          select: {
            id: true,
            accountType: true,
            name: true,
            currency: true,
          },
        },
        direction: true,
        amount: true,
        currency: true,
        transactionDate: true,
      },
    });

    const todayTotals = new Map<string, { income: number; expense: number }>();
    const monthTotals = new Map<string, { income: number; expense: number }>();
    const createAccountFlows = () => new Map<string, FinanceAccountFlow>(
      accounts.map((account) => [account.id, {
        accountId: account.id,
        accountType: account.accountType,
        name: account.name as { uz: string; ru: string },
        currency: account.currency,
        income: 0,
        expense: 0,
        transferIn: 0,
        transferOut: 0,
        netCashFlow: 0,
      }]),
    );
    const todayAccountTotals = createAccountFlows();
    const monthAccountTotals = createAccountFlows();

    const accountFlowFor = (
      totals: Map<string, FinanceAccountFlow>,
      accountId: string,
      account: { accountType: CashAccountType; name: Prisma.JsonValue; currency: string },
    ) => {
      let flow = totals.get(accountId);
      if (!flow) {
        flow = {
          accountId,
          accountType: account.accountType,
          name: account.name as { uz: string; ru: string },
          currency: account.currency,
          income: 0,
          expense: 0,
          transferIn: 0,
          transferOut: 0,
          netCashFlow: 0,
        };
        totals.set(accountId, flow);
      }
      return flow;
    };

    for (const tx of txs) {
      if (!tx.accountId || !tx.account || tx.account.currency !== tx.currency) {
        throw new BadRequestException('Finance transaction is missing its source cash/bank account or has a mismatched currency');
      }
      const amt = Number(tx.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new BadRequestException('Finance transaction amount must be a positive finite value');
      }
      const isToday = new Date(tx.transactionDate) >= startOfToday;
      if (tx.direction !== TransactionDirection.TRANSFER) {
        const month = monthTotals.get(tx.currency) ?? { income: 0, expense: 0 };
        const today = todayTotals.get(tx.currency) ?? { income: 0, expense: 0 };
        if (tx.direction === TransactionDirection.INCOME) {
          month.income += amt;
          if (isToday) today.income += amt;
        } else if (tx.direction === TransactionDirection.EXPENSE) {
          month.expense += amt;
          if (isToday) today.expense += amt;
        }
        monthTotals.set(tx.currency, month);
        if (isToday) todayTotals.set(tx.currency, today);
      }

      const monthlySourceFlow = accountFlowFor(monthAccountTotals, tx.accountId, tx.account);
      const dailySourceFlow = accountFlowFor(todayAccountTotals, tx.accountId, tx.account);
      const recalculate = (flow: FinanceAccountFlow) => {
        flow.netCashFlow = flow.income + flow.transferIn - flow.expense - flow.transferOut;
      };

      if (tx.direction === TransactionDirection.TRANSFER) {
        monthlySourceFlow.transferOut += amt;
        recalculate(monthlySourceFlow);
        if (isToday) {
          dailySourceFlow.transferOut += amt;
          recalculate(dailySourceFlow);
        }

        if (!tx.transferToId || !tx.transferToAccount) {
          throw new BadRequestException('Finance transfer is missing its destination cash/bank account');
        }
        const targetAmount = Number(tx.transferToAmount);
        if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
          throw new BadRequestException('Finance transfer destination amount must be a positive finite value');
        }
        const monthlyTargetFlow = accountFlowFor(
          monthAccountTotals,
          tx.transferToId,
          tx.transferToAccount,
        );
        monthlyTargetFlow.transferIn += targetAmount;
        recalculate(monthlyTargetFlow);

        if (isToday) {
          const dailyTargetFlow = accountFlowFor(
            todayAccountTotals,
            tx.transferToId,
            tx.transferToAccount,
          );
          dailyTargetFlow.transferIn += targetAmount;
          recalculate(dailyTargetFlow);
        }
        continue;
      }

      if (tx.direction === TransactionDirection.INCOME) {
        monthlySourceFlow.income += amt;
        if (isToday) dailySourceFlow.income += amt;
      } else {
        monthlySourceFlow.expense += amt;
        if (isToday) dailySourceFlow.expense += amt;
      }
      recalculate(monthlySourceFlow);
      if (isToday) recalculate(dailySourceFlow);
    }

    const formatFlowTotals = (totals: Map<string, { income: number; expense: number }>) =>
      Array.from(totals)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, values]) => ({
          currency,
          income: values.income,
          expense: values.expense,
          netCashFlow: values.income - values.expense,
        }));
    const todayByCurrency = formatFlowTotals(todayTotals);
    const monthByCurrency = formatFlowTotals(monthTotals);
    const formatAccountFlows = (totals: Map<string, FinanceAccountFlow>) =>
      Array.from(totals.values()).sort((left, right) => {
        const order: Record<string, number> = { UZS_CASH: 0, USD_CASH: 1, BANK: 2 };
        return (order[left.accountType ?? ''] ?? 3) - (order[right.accountType ?? ''] ?? 3)
          || left.currency.localeCompare(right.currency)
          || (left.accountId ?? '').localeCompare(right.accountId ?? '');
      });
    const todayOnly = todayByCurrency.length === 1
      ? todayByCurrency[0]
      : { income: 0, expense: 0, netCashFlow: 0 };
    const monthOnly = monthByCurrency.length === 1
      ? monthByCurrency[0]
      : { income: 0, expense: 0, netCashFlow: 0 };

    // Counterparty Debts
    const [settlementBalances, company] = await Promise.all([
      this.prisma.counterpartyBalance.findMany({
        where: { tenantId },
        select: {
          currency: true,
          customerDebt: true,
          supplierDebt: true,
        },
      }),
      this.prisma.company.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      }),
    ]);

    const reportCurrency = monthByCurrency.length === 1
      ? monthByCurrency[0].currency
      : (company?.settings as any)?.sales?.defaultCurrency || 'UZS';

    let totalCustomerDebt = 0; // Receivables (Kutilayotgan tushumlar)
    let totalSupplierDebt = 0; // Payables (To'lanishi kerak bo'lgan qarzlar)
    const receivablesByCurr: Record<string, number> = {};
    const payablesByCurr: Record<string, number> = {};
    const customerAdvancesByCurr: Record<string, number> = {};
    const supplierAdvancesByCurr: Record<string, number> = {};

    for (const balance of settlementBalances) {
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
    }

    const receivablesByCurrency = Object.entries(receivablesByCurr).map(([curr, amount]) => ({ currency: curr, amount }));
    const payablesByCurrency = Object.entries(payablesByCurr).map(([curr, amount]) => ({ currency: curr, amount }));
    const customerAdvancesByCurrency = Object.entries(customerAdvancesByCurr).map(([curr, amount]) => ({ currency: curr, amount }));
    const supplierAdvancesByCurrency = Object.entries(supplierAdvancesByCurr).map(([curr, amount]) => ({ currency: curr, amount }));
    if (receivablesByCurrency.length === 1) totalCustomerDebt = receivablesByCurrency[0].amount;
    if (payablesByCurrency.length === 1) totalSupplierDebt = payablesByCurrency[0].amount;

    return {
      currency: reportCurrency,
      balances: {
        dollarKassa,
        naqdKassa,
        hisobRaqam,
        accountCurrencies,
        totalLiquidByCurrency,
        totalLiquidUZSEquivalent: totalLiquidByCurrency.find((item) => item.currency === 'UZS')?.amount ?? 0,
      },
      today: {
        ...todayOnly,
        byCurrency: todayByCurrency,
        byAccount: formatAccountFlows(todayAccountTotals),
      },
      month: {
        ...monthOnly,
        byCurrency: monthByCurrency,
        byAccount: formatAccountFlows(monthAccountTotals),
      },
      debts: {
        receivables: totalCustomerDebt,
        payables: totalSupplierDebt,
        receivablesByCurrency,
        payablesByCurrency,
        customerAdvancesByCurrency,
        supplierAdvancesByCurrency,
      },
      accounts: accounts.map((a) => ({
        id: a.id,
        accountType: a.accountType,
        name: a.name,
        currency: a.currency,
        balance: Number(a.balance),
      })),
    };
  }

  // ─── Transactions Journal ─────────────────────────────────────

  async getTransactions(tenantId: string, filters: FilterTransactionsDto) {
    return this.listTransactions(tenantId, filters, false);
  }

  async getDeletedTransactions(tenantId: string, filters: FilterTransactionsDto) {
    return this.listTransactions(tenantId, filters, true);
  }

  private async listTransactions(
    tenantId: string,
    filters: FilterTransactionsDto,
    isDeleted: boolean,
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
      isDeleted,
    };

    if (filters.date_from || filters.date_to) {
      where.transactionDate = {};
      if (filters.date_from)
        where.transactionDate.gte = new Date(filters.date_from);
      if (filters.date_to)
        where.transactionDate.lte = new Date(filters.date_to + 'T23:59:59Z');
    }
    const ledgerFilters: any[] = [];
    if (filters.accountId) {
      ledgerFilters.push({
        OR: [
          { accountId: filters.accountId },
          { transferToId: filters.accountId },
        ],
      });
    }
    if (filters.direction) where.direction = filters.direction;
    if (filters.currency) {
      ledgerFilters.push({
        OR: [
          { currency: filters.currency },
          {
            direction: TransactionDirection.TRANSFER,
            transferToAccount: { is: { currency: filters.currency } },
          },
        ],
      });
    }
    if (ledgerFilters.length) where.AND = ledgerFilters;
    if (filters.counterpartyId) where.counterpartyId = filters.counterpartyId;
    if (filters.transactionTypeId)
      where.transactionTypeId = filters.transactionTypeId;
    if (filters.amountMin || filters.amountMax) {
      const amountFilter: Record<string, number> = {};
      if (filters.amountMin) amountFilter.gte = filters.amountMin;
      if (filters.amountMax) amountFilter.lte = filters.amountMax;
      if (filters.accountId) {
        ledgerFilters.push({
          OR: [
            { direction: { not: TransactionDirection.TRANSFER }, amount: amountFilter },
            { direction: TransactionDirection.TRANSFER, accountId: filters.accountId, amount: amountFilter },
            { direction: TransactionDirection.TRANSFER, transferToId: filters.accountId, transferToAmount: amountFilter },
          ],
        });
      } else {
        where.amount = amountFilter;
      }
    }

    const [total, transactions] = await Promise.all([
      this.prisma.financeTransaction.count({ where }),
      this.prisma.financeTransaction.findMany({
        where,
        include: {
          account: true,
          transferToAccount: true,
          counterparty: { select: { id: true, name: true, type: true } },
          transactionType: true,
        },
        orderBy: { transactionDate: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      limit,
      data: transactions,
    };
  }

  // ─── Create Income ────────────────────────────────────────────

  async createIncome(
    tenantId: string,
    dto: CreateIncomeDto,
    createdById?: string,
  ) {
    const exchangeRate = requireExchangeRateForCurrency(dto.currency, dto.exchangeRate);
    const account = await this.prisma.cashAccount.findFirst({
      where: { id: dto.accountId, tenantId, isActive: true },
    });
    if (!account) throw new NotFoundException('Cash account not found');
    if (!isCashAccountCurrencyValid(account)) {
      throw new BadRequestException(
        `Kassa turi (${account.accountType}) va valyutasi (${account.currency}) mos emas`,
      );
    }
    if (account.currency !== dto.currency) {
      throw new BadRequestException(
        `Kassa valyutasi (${account.currency}) va kirim valyutasi (${dto.currency}) bir xil bo'lishi shart`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.resolveSettlementContext(
        tx,
        tenantId,
        dto,
        TransactionDirection.INCOME,
      );
      const transaction = await tx.financeTransaction.create({
        data: {
          tenantId,
          direction: TransactionDirection.INCOME,
          status: TransactionStatus.POSTED,
          accountId: dto.accountId,
          amount: dto.amount,
          currency: dto.currency,
          exchangeRate,
          transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
          counterpartyId: dto.counterpartyId,
          settlementSide: settlement?.side ?? null,
          transactionTypeId: dto.transactionTypeId,
          comment: dto.comment,
          sourceDocType: dto.sourceDocType,
          sourceDocId: dto.sourceDocId,
          responsibleUserId: dto.responsibleUserId,
          createdById,
        },
        include: { account: true, counterparty: true, transactionType: true },
      });

      await tx.cashAccount.update({
        where: { id: dto.accountId },
        data: { balance: { increment: dto.amount } },
      });

      if (settlement?.side) {
        if (settlement.targetType && settlement.targetId) {
          await this.allocateAndUpdateTarget(
            tx,
            transaction,
            settlement,
            tenantId,
            dto.counterpartyId!,
            dto.amount,
          );
        } else if (!dto.sourceDocId && settlement.side === CounterpartySettlementSide.CUSTOMER) {
          await this.allocateIncomeFifo(tx, tenantId, transaction, dto.counterpartyId!, dto.amount, dto.currency);
        } else if (this.settlementMovementAmount(TransactionDirection.INCOME, settlement.side, dto.amount) > 0) {
          await this.assertCreditAvailable(tx, dto.counterpartyId!, dto.currency, settlement.side, dto.amount);
        }

        await this.settlementService.recordMovement(tx, {
          tenantId,
          counterpartyId: dto.counterpartyId!,
          currency: dto.currency,
          side: settlement.side,
          amount: this.settlementMovementAmount(TransactionDirection.INCOME, settlement.side, dto.amount),
          entryType: 'FINANCE_SETTLEMENT',
          effectiveAt: transaction.transactionDate,
          sourceDocType: 'FinanceTransaction',
          sourceDocId: transaction.id,
          idempotencyKey: `FinanceTransaction:${transaction.id}:SETTLEMENT`,
        });
      }

      return transaction;
    });
  }

  // ─── Create Expense ───────────────────────────────────────────

  async createExpense(
    tenantId: string,
    dto: CreateExpenseDto,
    createdById?: string,
  ) {
    const exchangeRate = requireExchangeRateForCurrency(dto.currency, dto.exchangeRate);
    const account = await this.prisma.cashAccount.findFirst({
      where: { id: dto.accountId, tenantId, isActive: true },
    });
    if (!account) throw new NotFoundException('Cash account not found');
    if (!isCashAccountCurrencyValid(account)) {
      throw new BadRequestException(
        `Kassa turi (${account.accountType}) va valyutasi (${account.currency}) mos emas`,
      );
    }
    if (account.currency !== dto.currency) {
      throw new BadRequestException(
        `Kassa valyutasi (${account.currency}) va chiqim valyutasi (${dto.currency}) bir xil bo'lishi shart`,
      );
    }

    // Invariant: Cash account cannot go negative
    if (Number(account.balance) < Number(dto.amount)) {
      throw new BadRequestException(
        `Chiquvchi kassada mablag' yetarli emas. Mavjud: ${account.balance} ${account.currency}, so'ralgan: ${dto.amount} ${dto.currency}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.resolveSettlementContext(
        tx,
        tenantId,
        dto,
        TransactionDirection.EXPENSE,
      );
      const transaction = await tx.financeTransaction.create({
        data: {
          tenantId,
          direction: TransactionDirection.EXPENSE,
          status: TransactionStatus.POSTED,
          accountId: dto.accountId,
          amount: dto.amount,
          currency: dto.currency,
          exchangeRate,
          transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
          counterpartyId: dto.counterpartyId,
          settlementSide: settlement?.side ?? null,
          transactionTypeId: dto.transactionTypeId,
          comment: dto.comment,
          sourceDocType: dto.sourceDocType,
          sourceDocId: dto.sourceDocId,
          responsibleUserId: dto.responsibleUserId,
          createdById,
        },
        include: { account: true, counterparty: true, transactionType: true },
      });

      await tx.cashAccount.update({
        where: { id: dto.accountId },
        data: { balance: { decrement: dto.amount } },
      });

      if (settlement?.side) {
        if (settlement.targetType && settlement.targetId) {
          await this.allocateAndUpdateTarget(
            tx,
            transaction,
            settlement,
            tenantId,
            dto.counterpartyId!,
            dto.amount,
          );
        } else if (!dto.sourceDocId && settlement.side === CounterpartySettlementSide.SUPPLIER) {
          await this.allocateExpenseFifo(tx, tenantId, transaction, dto.counterpartyId!, dto.amount, dto.currency);
        } else if (this.settlementMovementAmount(TransactionDirection.EXPENSE, settlement.side, dto.amount) > 0) {
          await this.assertCreditAvailable(tx, dto.counterpartyId!, dto.currency, settlement.side, dto.amount);
        }

        await this.settlementService.recordMovement(tx, {
          tenantId,
          counterpartyId: dto.counterpartyId!,
          currency: dto.currency,
          side: settlement.side,
          amount: this.settlementMovementAmount(TransactionDirection.EXPENSE, settlement.side, dto.amount),
          entryType: 'FINANCE_SETTLEMENT',
          effectiveAt: transaction.transactionDate,
          sourceDocType: 'FinanceTransaction',
          sourceDocId: transaction.id,
          idempotencyKey: `FinanceTransaction:${transaction.id}:SETTLEMENT`,
        });
      }

      return transaction;
    });
  }

  private async updateSettlementTargetPaidAmount(
    tx: Prisma.TransactionClient,
    targetType: SettlementAllocationTarget,
    targetId: string,
    amount: number,
    tenantId: string,
  ) {
    if (targetType === SettlementAllocationTarget.SALES_INVOICE) {
      const invoice = await tx.salesInvoice.findFirst({ where: { id: targetId, tenantId } });
      if (!invoice) throw new NotFoundException('Sales invoice settlement target not found');
      const paidAmount = Math.max(0, Number(invoice.paidAmount) + amount);
      const paymentStatus = paidAmount >= Number(invoice.totalAmount)
        ? SalesPaymentStatus.PAID
        : paidAmount > 0 ? SalesPaymentStatus.PARTIALLY_PAID : SalesPaymentStatus.UNPAID;
      await tx.salesInvoice.update({ where: { id: targetId }, data: { paidAmount, paymentStatus } });
      return;
    }

    if (targetType === SettlementAllocationTarget.SALES_ORDER) {
      const order = await tx.salesOrder.findFirst({ where: { id: targetId, tenantId } });
      if (!order) throw new NotFoundException('Sales order settlement target not found');
      const paidAmount = Number(order.paidAmount) + amount;
      let status = order.status;
      if (status === 'AWAITING_PAYMENT') {
        if (order.paymentCondition === 'PREPAID_100' && paidAmount >= Number(order.totalAmount)) {
          status = 'PAYMENT_CONFIRMED';
        } else if (order.paymentCondition === 'PARTIAL') {
          const required = Number(order.requiredPaymentPercent) || 0;
          if (paidAmount >= Number(order.totalAmount) * required / 100) status = 'PAYMENT_CONFIRMED';
        }
      }
      await tx.salesOrder.update({ where: { id: targetId }, data: { paidAmount, status } });
      return;
    }

    if (targetType === SettlementAllocationTarget.PURCHASE_RECEIPT) {
      const receipt = await tx.purchaseReceipt.findFirst({ where: { id: targetId, tenantId } });
      if (!receipt) throw new NotFoundException('Purchase receipt settlement target not found');
      const paidAmount = Number(receipt.paidAmount) + amount;
      const paymentStatus = paidAmount >= Number(receipt.totalAmount)
        ? PurchasePaymentStatus.PAID
        : paidAmount > 0 ? PurchasePaymentStatus.PARTIALLY_PAID : PurchasePaymentStatus.UNPAID;
      await tx.purchaseReceipt.update({ where: { id: targetId }, data: { paidAmount, paymentStatus } });
      return;
    }

    if (targetType === SettlementAllocationTarget.SERVICE_ACT) {
      const act = await tx.serviceAct.findFirst({ where: { id: targetId, tenantId } });
      if (!act) throw new NotFoundException('Service act settlement target not found');
      const paidAmount = Number(act.paidAmount) + amount;
      const paymentStatus = paidAmount >= Number(act.totalAmount)
        ? ServicePaymentStatus.PAID
        : paidAmount > 0 ? ServicePaymentStatus.PARTIALLY_PAID : ServicePaymentStatus.UNPAID;
      await tx.serviceAct.update({ where: { id: targetId }, data: { paidAmount, paymentStatus } });
      return;
    }

    if (targetType === SettlementAllocationTarget.ADDITIONAL_EXPENSE) {
      const expense = await tx.additionalExpense.findFirst({ where: { id: targetId, tenantId } });
      if (!expense) throw new NotFoundException('Additional expense settlement target not found');
      const allocations = await tx.settlementAllocation.findMany({
        where: { targetType, targetId },
        select: { amount: true },
      });
      const allocatedAmount = allocations.reduce((sum, item) => sum + Number(item.amount), 0);
      const isPaid = allocatedAmount >= Number(expense.amount) + Number(expense.vatAmount);
      if (expense.isPaid !== isPaid) {
        await tx.additionalExpense.update({ where: { id: targetId }, data: { isPaid } });
      }
    }
  }

  private settlementMovementAmount(
    direction: SettlementDirection,
    side: CounterpartySettlementSide,
    amount: number,
  ) {
    const reducesObligation =
      (direction === TransactionDirection.INCOME && side === CounterpartySettlementSide.CUSTOMER) ||
      (direction === TransactionDirection.EXPENSE && side === CounterpartySettlementSide.SUPPLIER);
    return reducesObligation ? -Number(amount) : Number(amount);
  }

  private async resolveSettlementContext(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateIncomeDto | CreateExpenseDto,
    direction: SettlementDirection,
  ): Promise<FinanceSettlementContext | null> {
    if (!dto.counterpartyId) {
      if (dto.settlementSide) throw new BadRequestException('Settlement side requires a counterparty');
      return null;
    }
    const counterparty = await tx.counterparty.findFirst({
      where: { id: dto.counterpartyId, tenantId },
      select: { id: true },
    });
    if (!counterparty) throw new NotFoundException('Counterparty not found');

    const sourceId = dto.sourceDocId;
    const sourceType = dto.sourceDocType;
    let side: CounterpartySettlementSide | undefined;
    let targetType: SettlementAllocationTarget | undefined;
    const ensureSource = (source: { counterpartyId: string; currency: string; status: string } | null, label: string) => {
      if (!source || source.counterpartyId !== dto.counterpartyId || source.currency !== dto.currency) {
        throw new BadRequestException(`${label} settlement source counterparty or currency does not match`);
      }
      if (source.status !== 'POSTED') throw new BadRequestException(`${label} must be posted before settlement`);
    };

    if (sourceType === 'SalesInvoice' && sourceId) {
      const source = await tx.salesInvoice.findFirst({ where: { id: sourceId, tenantId } });
      ensureSource(source, 'Sales invoice');
      if (direction !== TransactionDirection.INCOME) throw new BadRequestException('Sales invoice requires customer income');
      side = CounterpartySettlementSide.CUSTOMER;
      targetType = SettlementAllocationTarget.SALES_INVOICE;
    } else if (sourceType === 'SalesOrder' && sourceId) {
      const source = await tx.salesOrder.findFirst({ where: { id: sourceId, tenantId } });
      if (!source || source.counterpartyId !== dto.counterpartyId || source.currency !== dto.currency || source.status === 'CANCELLED') {
        throw new BadRequestException('Sales order settlement source counterparty or currency does not match');
      }
      if (direction !== TransactionDirection.INCOME) throw new BadRequestException('Sales order requires customer income');
      side = CounterpartySettlementSide.CUSTOMER;
      targetType = SettlementAllocationTarget.SALES_ORDER;
    } else if (sourceType === 'SalesReturn' && sourceId) {
      const source = await tx.salesReturn.findFirst({ where: { id: sourceId, tenantId } });
      ensureSource(source, 'Sales return');
      if (direction !== TransactionDirection.EXPENSE) throw new BadRequestException('Sales return refund requires customer expense');
      side = CounterpartySettlementSide.CUSTOMER;
      targetType = SettlementAllocationTarget.SALES_RETURN;
    } else if (sourceType === 'PurchaseReceipt' && sourceId) {
      const source = await tx.purchaseReceipt.findFirst({ where: { id: sourceId, tenantId } });
      ensureSource(source, 'Purchase receipt');
      if (direction !== TransactionDirection.EXPENSE) throw new BadRequestException('Purchase receipt requires supplier expense');
      side = CounterpartySettlementSide.SUPPLIER;
      targetType = SettlementAllocationTarget.PURCHASE_RECEIPT;
    } else if (sourceType === 'PurchaseReturn' && sourceId) {
      const source = await tx.purchaseReturn.findFirst({ where: { id: sourceId, tenantId } });
      ensureSource(source, 'Purchase return');
      if (direction !== TransactionDirection.INCOME) throw new BadRequestException('Purchase return refund requires supplier income');
      side = CounterpartySettlementSide.SUPPLIER;
      targetType = SettlementAllocationTarget.PURCHASE_RETURN;
    } else if (sourceType === 'ServiceAct' && sourceId) {
      const source = await tx.serviceAct.findFirst({ where: { id: sourceId, tenantId } });
      if (!source) throw new NotFoundException('Service act settlement source not found');
      ensureSource(source, 'Service act');
      side = source.type === 'PROVIDED'
        ? CounterpartySettlementSide.CUSTOMER
        : CounterpartySettlementSide.SUPPLIER;
      const expectedDirection = source.type === 'PROVIDED'
        ? TransactionDirection.INCOME
        : TransactionDirection.EXPENSE;
      if (direction !== expectedDirection) throw new BadRequestException('Service act settlement direction does not match its type');
      targetType = SettlementAllocationTarget.SERVICE_ACT;
    } else if (sourceType === 'AdditionalExpense' && sourceId) {
      const source = await tx.additionalExpense.findFirst({ where: { id: sourceId, tenantId } });
      if (!source) throw new NotFoundException('Additional expense settlement source not found');
      ensureSource(source, 'Additional expense');
      if (source.isPaid || direction !== TransactionDirection.EXPENSE) {
        throw new BadRequestException('Additional expense is already paid or transaction direction is invalid');
      }
      side = CounterpartySettlementSide.SUPPLIER;
      targetType = SettlementAllocationTarget.ADDITIONAL_EXPENSE;
    }

    if (side && dto.settlementSide && dto.settlementSide !== side) {
      throw new BadRequestException('Settlement side conflicts with the linked source document');
    }
    side ??= dto.settlementSide;
    if (!side || !Object.values(CounterpartySettlementSide).includes(side)) {
      throw new BadRequestException('Choose whether this transaction settles a customer or supplier balance');
    }
    return { side, targetType, targetId: targetType ? sourceId : undefined };
  }

  private async assertCreditAvailable(
    tx: Prisma.TransactionClient,
    counterpartyId: string,
    currency: string,
    side: CounterpartySettlementSide,
    amount: number,
  ) {
    const balance = await tx.counterpartyBalance.findUnique({
      where: { counterpartyId_currency: { counterpartyId, currency } },
      select: { customerDebt: true, supplierDebt: true },
    });
    const current = Number(side === CounterpartySettlementSide.CUSTOMER
      ? balance?.customerDebt ?? 0
      : balance?.supplierDebt ?? 0);
    if (current > -Number(amount) + 0.000001) {
      throw new BadRequestException('Refund exceeds the available counterparty advance in this currency');
    }
  }

  private async allocateAndUpdateTarget(
    tx: Prisma.TransactionClient,
    transaction: { id: string },
    settlement: FinanceSettlementContext,
    tenantId: string,
    counterpartyId: string,
    amount: number,
  ) {
    if (!settlement.side || !settlement.targetType || !settlement.targetId) return;
    await this.settlementAllocationService.recordAllocation(tx, {
      tenantId,
      counterpartyId,
      financeTransactionId: transaction.id,
      targetType: settlement.targetType,
      targetId: settlement.targetId,
      amount,
      idempotencyKey: `FinanceTransaction:${transaction.id}:${settlement.targetType}:${settlement.targetId}`,
    });

    if (settlement.targetType === SettlementAllocationTarget.SALES_INVOICE) {
      const invoice = await tx.salesInvoice.findFirst({ where: { id: settlement.targetId, tenantId } });
      if (!invoice) throw new NotFoundException('Sales invoice settlement target not found');
      const paidAmount = Number(invoice.paidAmount) + amount;
      const paymentStatus = paidAmount >= Number(invoice.totalAmount)
        ? SalesPaymentStatus.PAID
        : paidAmount > 0 ? SalesPaymentStatus.PARTIALLY_PAID : SalesPaymentStatus.UNPAID;
      await tx.salesInvoice.update({ where: { id: invoice.id }, data: { paidAmount, paymentStatus } });
    } else if (settlement.targetType === SettlementAllocationTarget.SALES_ORDER) {
      const order = await tx.salesOrder.findFirst({ where: { id: settlement.targetId, tenantId } });
      if (!order) throw new NotFoundException('Sales order settlement target not found');
      const paidAmount = Math.max(0, Number(order.paidAmount) + amount);
      let status = order.status;
      const total = Number(order.totalAmount);
      const requiredAmount = order.paymentCondition === 'PREPAID_100'
        ? total
        : order.paymentCondition === 'PARTIAL'
          ? total * Number(order.requiredPaymentPercent ?? 0) / 100
          : 0;
      if (status === 'AWAITING_PAYMENT' && paidAmount >= requiredAmount) {
        status = 'PAYMENT_CONFIRMED';
      } else if (status === 'PAYMENT_CONFIRMED' && paidAmount < requiredAmount) {
        status = 'AWAITING_PAYMENT';
      }
      await tx.salesOrder.update({ where: { id: order.id }, data: { paidAmount, status } });
    } else if (settlement.targetType === SettlementAllocationTarget.PURCHASE_RECEIPT) {
      const receipt = await tx.purchaseReceipt.findFirst({ where: { id: settlement.targetId, tenantId } });
      if (!receipt) throw new NotFoundException('Purchase receipt settlement target not found');
      const paidAmount = Math.max(0, Number(receipt.paidAmount) + amount);
      const paymentStatus = paidAmount >= Number(receipt.totalAmount)
        ? PurchasePaymentStatus.PAID
        : paidAmount > 0 ? PurchasePaymentStatus.PARTIALLY_PAID : PurchasePaymentStatus.UNPAID;
      await tx.purchaseReceipt.update({ where: { id: receipt.id }, data: { paidAmount, paymentStatus } });
    } else if (settlement.targetType === SettlementAllocationTarget.SERVICE_ACT) {
      const act = await tx.serviceAct.findFirst({ where: { id: settlement.targetId, tenantId } });
      if (!act) throw new NotFoundException('Service act settlement target not found');
      const paidAmount = Math.max(0, Number(act.paidAmount) + amount);
      const paymentStatus = paidAmount >= Number(act.totalAmount)
        ? ServicePaymentStatus.PAID
        : paidAmount > 0 ? ServicePaymentStatus.PARTIALLY_PAID : ServicePaymentStatus.UNPAID;
      await tx.serviceAct.update({ where: { id: act.id }, data: { paidAmount, paymentStatus } });
    } else if (settlement.targetType === SettlementAllocationTarget.ADDITIONAL_EXPENSE) {
      const expense = await tx.additionalExpense.findFirst({ where: { id: settlement.targetId, tenantId } });
      if (!expense) throw new NotFoundException('Additional expense settlement target not found');
      const allocations = await tx.settlementAllocation.findMany({
        where: { targetType: settlement.targetType, targetId: settlement.targetId },
        select: { amount: true },
      });
      const paidAmount = allocations.reduce((sum, item) => sum + Number(item.amount), 0);
      if (paidAmount >= Number(expense.amount) + Number(expense.vatAmount)) {
        await tx.additionalExpense.update({ where: { id: expense.id }, data: { isPaid: true } });
      }
    }
  }

  private async allocateIncomeFifo(
    tx: Prisma.TransactionClient,
    tenantId: string,
    transaction: { id: string },
    counterpartyId: string,
    amount: number,
    currency: string,
  ) {
    const [invoices, acts] = await Promise.all([
      tx.salesInvoice.findMany({
        where: { tenantId, counterpartyId, currency, status: SalesDocStatus.POSTED, paymentStatus: { in: [SalesPaymentStatus.UNPAID, SalesPaymentStatus.PARTIALLY_PAID] } },
        orderBy: { invoiceDate: 'asc' },
      }),
      tx.serviceAct.findMany({
        where: { tenantId, counterpartyId, currency, status: 'POSTED', type: ServiceActType.PROVIDED, paymentStatus: { in: [ServicePaymentStatus.UNPAID, ServicePaymentStatus.PARTIALLY_PAID] } },
        orderBy: { actDate: 'asc' },
      }),
    ]);
    const targets: FifoSettlementTarget[] = [
      ...invoices.map((invoice) => ({
        targetType: SettlementAllocationTarget.SALES_INVOICE,
        targetId: invoice.id,
        side: CounterpartySettlementSide.CUSTOMER,
        effectiveAt: invoice.invoiceDate,
        openAmount: Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount)),
      })),
      ...acts.map((act) => ({
        targetType: SettlementAllocationTarget.SERVICE_ACT,
        targetId: act.id,
        side: CounterpartySettlementSide.CUSTOMER,
        effectiveAt: act.actDate,
        openAmount: Math.max(0, Number(act.totalAmount) - Number(act.paidAmount)),
      })),
    ].sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime());
    await this.allocateFifoTargets(tx, tenantId, transaction, counterpartyId, amount, targets);
  }

  private async allocateExpenseFifo(
    tx: Prisma.TransactionClient,
    tenantId: string,
    transaction: { id: string },
    counterpartyId: string,
    amount: number,
    currency: string,
  ) {
    const [receipts, acts, expenses] = await Promise.all([
      tx.purchaseReceipt.findMany({
        where: { tenantId, counterpartyId, currency, status: PurchaseDocStatus.POSTED, paymentStatus: { in: [PurchasePaymentStatus.UNPAID, PurchasePaymentStatus.PARTIALLY_PAID] } },
        orderBy: { docDate: 'asc' },
      }),
      tx.serviceAct.findMany({
        where: { tenantId, counterpartyId, currency, status: 'POSTED', type: ServiceActType.RECEIVED, paymentStatus: { in: [ServicePaymentStatus.UNPAID, ServicePaymentStatus.PARTIALLY_PAID] } },
        orderBy: { actDate: 'asc' },
      }),
      tx.additionalExpense.findMany({
        where: { tenantId, counterpartyId, currency, status: PurchaseDocStatus.POSTED, isPaid: false },
        orderBy: { docDate: 'asc' },
      }),
    ]);
    const targets: FifoSettlementTarget[] = [
      ...receipts.map((receipt) => ({
        targetType: SettlementAllocationTarget.PURCHASE_RECEIPT,
        targetId: receipt.id,
        side: CounterpartySettlementSide.SUPPLIER,
        effectiveAt: receipt.docDate,
        openAmount: Math.max(0, Number(receipt.totalAmount) - Number(receipt.paidAmount)),
      })),
      ...acts.map((act) => ({
        targetType: SettlementAllocationTarget.SERVICE_ACT,
        targetId: act.id,
        side: CounterpartySettlementSide.SUPPLIER,
        effectiveAt: act.actDate,
        openAmount: Math.max(0, Number(act.totalAmount) - Number(act.paidAmount)),
      })),
      ...expenses.map((expense) => ({
        targetType: SettlementAllocationTarget.ADDITIONAL_EXPENSE,
        targetId: expense.id,
        side: CounterpartySettlementSide.SUPPLIER,
        effectiveAt: expense.docDate,
        openAmount: Math.max(0, Number(expense.amount) + Number(expense.vatAmount)),
      })),
    ].sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime());
    await this.allocateFifoTargets(tx, tenantId, transaction, counterpartyId, amount, targets);
  }

  private async allocateFifoTargets(
    tx: Prisma.TransactionClient,
    tenantId: string,
    transaction: { id: string },
    counterpartyId: string,
    amount: number,
    targets: FifoSettlementTarget[],
  ) {
    let remaining = Number(amount);
    for (const target of targets) {
      if (remaining <= 0) break;
      const allocate = Math.min(target.openAmount, remaining);
      if (allocate <= 0) continue;
      await this.allocateAndUpdateTarget(tx, transaction, {
        side: target.side,
        targetType: target.targetType,
        targetId: target.targetId,
      }, tenantId, counterpartyId, allocate);
      remaining -= allocate;
    }
  }

  // ─── Create Transfer ──────────────────────────────────────────

  async createTransfer(
    tenantId: string,
    dto: CreateTransferDto,
    createdById?: string,
  ) {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException(
        "Chiquvchi va qabul qiluvchi hisoblar har xil bo'lishi shart",
      );
    }

    const [fromAccount, toAccount] = await Promise.all([
      this.prisma.cashAccount.findFirst({
        where: { id: dto.fromAccountId, tenantId, isActive: true },
      }),
      this.prisma.cashAccount.findFirst({
        where: { id: dto.toAccountId, tenantId, isActive: true },
      }),
    ]);

    if (!fromAccount)
      throw new NotFoundException('Chiquvchi kassa hisobi topilmadi');
    if (!toAccount)
      throw new NotFoundException('Qabul qiluvchi kassa hisobi topilmadi');
    if (!isCashAccountCurrencyValid(fromAccount) || !isCashAccountCurrencyValid(toAccount)) {
      throw new BadRequestException('O‘tkazmadagi har ikkala hisobning turi va valyutasi mos bo‘lishi shart');
    }
    if (dto.currency !== fromAccount.currency) {
      throw new BadRequestException(
        `O‘tkazma valyutasi (${dto.currency}) manba hisob valyutasiga (${fromAccount.currency}) mos emas`,
      );
    }

    const fromAmount = Math.round(Number(dto.amount) * 100) / 100;
    if (fromAmount <= 0) {
      throw new BadRequestException("Miqdor musbat bo'lishi kerak");
    }

    if (Number(fromAccount.balance) < fromAmount) {
      throw new BadRequestException(
        `Chiquvchi kassada mablag' yetarli emas. Mavjud: ${fromAccount.balance} ${fromAccount.currency}`,
      );
    }

    const fromCurrency = fromAccount.currency;
    const toCurrency = toAccount.currency;

    let toAmount = fromAmount;
    let transferExchangeRate: number | null = null;
    let autoComment = dto.comment || '';

    if (fromCurrency !== toCurrency) {
      const targetAmount = Number(dto.targetAmount);
      const rawExchangeRate = Number(dto.exchangeRate);
      const exchangeRate = Number.isFinite(rawExchangeRate) && rawExchangeRate > 0
        ? Math.round(rawExchangeRate * 10000) / 10000
        : rawExchangeRate;
      const hasTargetAmount = Number.isFinite(targetAmount) && targetAmount > 0;
      const hasExchangeRate = Number.isFinite(exchangeRate) && exchangeRate > 0;
      if (!hasTargetAmount && !hasExchangeRate) {
        throw new BadRequestException(
          `Turli valyutadagi hisoblar uchun konvertatsiya kursi yoki yakuniy summa kiritilishi shart (${fromCurrency} -> ${toCurrency})`,
        );
      }

      const rateAmount = hasExchangeRate
        ? Math.round(
            (fromCurrency === 'USD' ? fromAmount * exchangeRate : fromAmount / exchangeRate) * 100,
          ) / 100
        : undefined;
      if (hasTargetAmount && rateAmount !== undefined && Math.abs(targetAmount - rateAmount) > 0.01) {
        throw new BadRequestException('Konvertatsiya kursi va yakuniy summa bir-biriga mos kelmaydi');
      }
      toAmount = Math.round((hasTargetAmount ? targetAmount : rateAmount!) * 100) / 100;
      const usdToUzsRateRaw = fromCurrency === 'USD'
        ? toAmount / fromAmount
        : fromAmount / toAmount;
      const usdToUzsRate = Math.round(usdToUzsRateRaw * 10000) / 10000;
      transferExchangeRate = hasExchangeRate ? exchangeRate : usdToUzsRate;
      const amountAtRecordedRate = Math.round(
        (fromCurrency === 'USD'
          ? fromAmount * transferExchangeRate
          : fromAmount / transferExchangeRate) * 100,
      ) / 100;
      if (Math.abs(amountAtRecordedRate - toAmount) > 0.01) {
        throw new BadRequestException('Qabul summasi qayd etilgan valyuta kursiga mos kelmaydi');
      }
      const conversionNote = `Konvertatsiya: ${fromAmount} ${fromCurrency} -> ${toAmount} ${toCurrency} (1 USD = ${usdToUzsRate} UZS)`;
      autoComment = autoComment
        ? `${autoComment} | ${conversionNote}`
        : conversionNote;
    } else if (dto.targetAmount !== undefined && Number(dto.targetAmount) !== fromAmount) {
      throw new BadRequestException('Bir xil valyutadagi o‘tkazmada manba va qabul summasi teng bo‘lishi shart');
    }
    const transactionExchangeRate = requireExchangeRateForCurrency(
      fromCurrency,
      fromCurrency === 'USD' ? transferExchangeRate ?? dto.exchangeRate : undefined,
    );

    const tx = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.financeTransaction.create({
        data: {
          tenantId,
          direction: TransactionDirection.TRANSFER,
          status: TransactionStatus.POSTED,
          accountId: dto.fromAccountId,
          transferToId: dto.toAccountId,
          amount: fromAmount,
          transferToAmount: toAmount,
          transferExchangeRate,
          currency: fromCurrency,
          exchangeRate: transactionExchangeRate,
          transactionDate: dto.transactionDate
            ? new Date(dto.transactionDate)
            : new Date(),
          comment: autoComment,
          createdById,
        },
        include: { account: true, transferToAccount: true },
      });

      // Deduct from source
      await tx.cashAccount.update({
        where: { id: dto.fromAccountId },
        data: { balance: { decrement: fromAmount } },
      });

      // Add to destination
      await tx.cashAccount.update({
        where: { id: dto.toAccountId },
        data: { balance: { increment: toAmount } },
      });

      return transaction;
    });

    return tx;
  }

  // ─── Cancel Transaction (Storno) ──────────────────────────────

  async cancelTransaction(
    tenantId: string,
    id: string,
    dto?: CancelTransactionDto,
    cancelledById?: string,
  ) {
    const existing = await this.prisma.financeTransaction.findFirst({
      where: { id, tenantId, isDeleted: false, status: TransactionStatus.POSTED },
      include: { account: true, transferToAccount: true },
    });
    if (!existing) throw new NotFoundException('Transaction not found or already cancelled');

    return this.prisma.$transaction((tx) =>
      this.reversePostedTransaction(
        tx,
        tenantId,
        existing,
        dto,
        cancelledById,
        false,
      ),
    );
  }

  private async reverseCounterpartySettlement(
    tx: Prisma.TransactionClient,
    tenantId: string,
    transaction: Prisma.FinanceTransactionGetPayload<{
      include: { account: true; transferToAccount: true };
    }>,
    amount: number,
    isDeleted: boolean,
  ) {
    if (!transaction.counterpartyId) return;
    if (!transaction.settlementSide) {
      if (transaction.sourceDocType === 'AdditionalExpense') return;
      throw new BadRequestException('Finance transaction settlement side is missing; reconcile it before reversal');
    }

    const originalEntry = await tx.counterpartySettlementEntry.findUnique({
      where: { idempotencyKey: `FinanceTransaction:${transaction.id}:SETTLEMENT` },
    });
    if (!originalEntry) {
      throw new BadRequestException('Finance transaction has no settlement ledger entry; reconcile it before reversal');
    }
    const eventName = isDeleted ? 'DELETED' : 'CANCELLED';
    const inverseAmount = -this.settlementMovementAmount(
      transaction.direction as SettlementDirection,
      transaction.settlementSide,
      amount,
    );
    await this.settlementService.recordMovement(tx, {
      tenantId,
      counterpartyId: transaction.counterpartyId,
      currency: transaction.currency,
      side: transaction.settlementSide,
      amount: inverseAmount,
      entryType: `FINANCE_TRANSACTION_${eventName}`,
      effectiveAt: new Date(),
      sourceDocType: 'FinanceTransaction',
      sourceDocId: transaction.id,
      idempotencyKey: `FinanceTransaction:${transaction.id}:${eventName}`,
      reversesEntryId: originalEntry.id,
    });

    const allocations = await tx.settlementAllocation.findMany({
      where: { financeTransactionId: transaction.id },
      select: {
        id: true,
        amount: true,
        targetType: true,
        targetId: true,
        reversesAllocationId: true,
      },
    });
    const reversedAllocationIds = new Set(
      allocations
        .map((allocation) => allocation.reversesAllocationId)
        .filter((allocationId): allocationId is string => allocationId !== null),
    );
    const activeAllocations = allocations.filter(
      (allocation) => Number(allocation.amount) > 0 && !allocation.reversesAllocationId && !reversedAllocationIds.has(allocation.id),
    );

    for (const allocation of activeAllocations) {
      await this.settlementAllocationService.reverseAllocation(tx, {
        tenantId,
        allocationId: allocation.id,
        idempotencyKey: `FinanceTransaction:${transaction.id}:${eventName}:ALLOCATION:${allocation.id}`,
      });
      await this.updateSettlementTargetPaidAmount(
        tx,
        allocation.targetType,
        allocation.targetId,
        -Number(allocation.amount),
        tenantId,
      );
    }

    if (activeAllocations.length === 0) {
      await this.reverseLegacyDocumentAllocation(tx, tenantId, transaction, amount);
    }

    // Pre-dispatch payments remain linked to their SalesOrder even after the
    // resulting invoice is allocated. Keep that order's collected amount in sync.
    if (transaction.sourceDocType === 'PAYMENT' && transaction.sourceDocId) {
      const payment = await tx.payment.findFirst({
        where: { id: transaction.sourceDocId, tenantId },
        select: { orderId: true },
      });
      if (payment?.orderId) {
        await this.updateSettlementTargetPaidAmount(
          tx,
          SettlementAllocationTarget.SALES_ORDER,
          payment.orderId,
          -amount,
          tenantId,
        );
      }
    }
  }

  private async reverseLegacyDocumentAllocation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    transaction: Prisma.FinanceTransactionGetPayload<{
      include: { account: true; transferToAccount: true };
    }>,
    amount: number,
  ) {
    if (!transaction.sourceDocType || !transaction.sourceDocId) return;
    const targetTypeBySource: Partial<Record<string, SettlementAllocationTarget>> = {
      SalesInvoice: SettlementAllocationTarget.SALES_INVOICE,
      SalesOrder: SettlementAllocationTarget.SALES_ORDER,
      PurchaseReceipt: SettlementAllocationTarget.PURCHASE_RECEIPT,
      ServiceAct: SettlementAllocationTarget.SERVICE_ACT,
      AdditionalExpense: SettlementAllocationTarget.ADDITIONAL_EXPENSE,
    };
    const targetType = targetTypeBySource[transaction.sourceDocType];
    if (targetType) {
      await this.updateSettlementTargetPaidAmount(
        tx,
        targetType,
        transaction.sourceDocId,
        -amount,
        tenantId,
      );
      return;
    }
    if (transaction.sourceDocType !== 'PAYMENT') return;

    const payment = await tx.payment.findFirst({
      where: { id: transaction.sourceDocId, tenantId },
      select: { invoiceId: true, orderId: true },
    });
    if (payment?.invoiceId) {
      await this.updateSettlementTargetPaidAmount(
        tx,
        SettlementAllocationTarget.SALES_INVOICE,
        payment.invoiceId,
        -amount,
        tenantId,
      );
    }
  }

  private async reversePostedTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    existing: Prisma.FinanceTransactionGetPayload<{
      include: { account: true; transferToAccount: true };
    }>,
    dto: CancelTransactionDto | undefined,
    cancelledById: string | undefined,
    isDeleted: boolean,
  ) {
    const amount = Number(existing.amount);

    if (existing.direction === TransactionDirection.INCOME) {
      // Safe check: Account balance cannot go negative
      if (existing.accountId) {
        const acc = await tx.cashAccount.findUnique({
          where: { id: existing.accountId },
        });
        if (!acc || Number(acc.balance) < amount) {
          throw new BadRequestException(
            "Kirimni bekor qilish imkonsiz: kassada yetarli qoldiq mavjud emas (manfiy qoldiq yuzaga keladi)",
          );
        }
        await tx.cashAccount.update({
          where: { id: existing.accountId },
          data: { balance: { decrement: amount } },
        });
      }

      await this.reverseCounterpartySettlement(tx, tenantId, existing, amount, isDeleted);
    } else if (existing.direction === TransactionDirection.EXPENSE) {
      // Return money to account
      if (existing.accountId) {
        await tx.cashAccount.update({
          where: { id: existing.accountId },
          data: { balance: { increment: amount } },
        });
      }

      await this.reverseCounterpartySettlement(tx, tenantId, existing, amount, isDeleted);
    } else if (existing.direction === TransactionDirection.TRANSFER) {
      const destinationAmount = Number(existing.transferToAmount ?? amount);
      if (existing.transferToId) {
        const toAcc = await tx.cashAccount.findUnique({
          where: { id: existing.transferToId },
        });
        if (!toAcc || Number(toAcc.balance) < destinationAmount) {
          throw new BadRequestException(
            "O'tkazmani bekor qilish imkonsiz: qabul qiluvchi kassada yetarli qoldiq mavjud emas",
          );
        }
        await tx.cashAccount.update({
          where: { id: existing.transferToId },
          data: { balance: { decrement: destinationAmount } },
        });
      }
      if (existing.accountId) {
        await tx.cashAccount.update({
          where: { id: existing.accountId },
          data: { balance: { increment: amount } },
        });
      }
    }

    const finalized = await tx.financeTransaction.updateMany({
      where: {
        id: existing.id,
        tenantId,
        isDeleted: false,
        status: TransactionStatus.POSTED,
      },
      data: {
        status: TransactionStatus.CANCELLED,
        cancelledById: cancelledById || null,
        cancelledAt: new Date(),
        cancellationReason: dto?.reason || null,
        ...(isDeleted ? { isDeleted: true } : {}),
      },
    });
    if (finalized.count !== 1) {
      throw new NotFoundException('Transaction not found or already cancelled');
    }

    if (isDeleted) {
      return {
        success: true,
        id: existing.id,
        status: TransactionStatus.CANCELLED,
        isDeleted: true,
      };
    }

    return { success: true, id: existing.id, status: TransactionStatus.CANCELLED };
  }

  // ─── Edit Transaction ─────────────────────────────────────────

  async updateTransaction(
    tenantId: string,
    id: string,
    data: Partial<{ comment: string; transactionTypeId: string }>,
  ) {
    const existing = await this.prisma.financeTransaction.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Transaction not found');

    return this.prisma.financeTransaction.update({
      where: { id },
      data: {
        comment: data.comment,
        transactionTypeId: data.transactionTypeId,
        updatedAt: new Date(),
      },
    });
  }

  // ─── Delete Transaction (Soft-delete fallback) ────────────────

  async deleteTransaction(
    tenantId: string,
    id: string,
    deletedById?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.financeTransaction.findFirst({
        where: { id, tenantId, isDeleted: false },
        include: { account: true, transferToAccount: true },
      });
      if (!existing) throw new NotFoundException('Transaction not found');

      if (existing.status === TransactionStatus.POSTED) {
        return this.reversePostedTransaction(
          tx,
          tenantId,
          existing,
          undefined,
          deletedById,
          true,
        );
      }

      await tx.financeTransaction.update({
        where: { id },
        data: { isDeleted: true },
      });
      return {
        success: true,
        id,
        status: existing.status,
        isDeleted: true,
      };
    });
  }

  async restoreTransaction(tenantId: string, id: string) {
    const existing = await this.prisma.financeTransaction.findFirst({
      where: { id, tenantId, isDeleted: true },
    });
    if (!existing) throw new NotFoundException('Transaction not found');

    return this.prisma.financeTransaction.update({
      where: { id },
      data: { isDeleted: false },
    });
  }

  // ─── Transaction Types ────────────────────────────────────────

  async getTransactionTypes(tenantId: string) {
    return this.prisma.transactionType.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null, isSystem: true }],
      },
      orderBy: [{ direction: 'asc' }, { isSystem: 'desc' }],
    });
  }
}
