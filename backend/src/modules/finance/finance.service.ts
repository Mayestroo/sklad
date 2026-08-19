import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import {
  TransactionDirection,
  SalesDocStatus,
  SalesPaymentStatus,
} from '@prisma/client';
import { CreateIncomeDto } from './dto/create-income.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { FilterTransactionsDto } from './dto/filter-transactions.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

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
        name: { uz: 'Naqd pul (UZS)', ru: 'Наличные (UZS)' },
        currency: 'UZS',
      },
      {
        accountType: 'USD_CASH' as const,
        name: { uz: 'Naqd pul (USD)', ru: 'Наличные (USD)' },
        currency: 'USD',
      },
      {
        accountType: 'BANK' as const,
        name: { uz: 'Bank hisobi', ru: 'Банковский счёт' },
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
    };

    if (filters.date_from || filters.date_to) {
      where.transactionDate = {};
      if (filters.date_from)
        where.transactionDate.gte = new Date(filters.date_from);
      if (filters.date_to)
        where.transactionDate.lte = new Date(filters.date_to + 'T23:59:59Z');
    }

    if (filters.currency) {
      where.currency = filters.currency;
    }

    const transactions = await this.prisma.financeTransaction.findMany({
      where,
      select: { direction: true, amount: true, currency: true },
    });

    // Group by currency
    const byCurrency: Record<string, { income: number; expense: number }> = {};

    for (const tx of transactions) {
      if (tx.direction === TransactionDirection.TRANSFER) continue; // never counted
      if (!byCurrency[tx.currency])
        byCurrency[tx.currency] = { income: 0, expense: 0 };
      if (tx.direction === TransactionDirection.INCOME) {
        byCurrency[tx.currency].income += Number(tx.amount);
      } else {
        byCurrency[tx.currency].expense += Number(tx.amount);
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

    // Account balances
    const accounts = await this.getAccounts(tenantId);

    return {
      summaryByCurrency,
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
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
      isDeleted: false,
    };

    if (filters.date_from || filters.date_to) {
      where.transactionDate = {};
      if (filters.date_from)
        where.transactionDate.gte = new Date(filters.date_from);
      if (filters.date_to)
        where.transactionDate.lte = new Date(filters.date_to + 'T23:59:59Z');
    }
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.direction) where.direction = filters.direction;
    if (filters.currency) where.currency = filters.currency;
    if (filters.counterpartyId) where.counterpartyId = filters.counterpartyId;
    if (filters.transactionTypeId)
      where.transactionTypeId = filters.transactionTypeId;
    if (filters.amountMin || filters.amountMax) {
      where.amount = {};
      if (filters.amountMin) where.amount.gte = filters.amountMin;
      if (filters.amountMax) where.amount.lte = filters.amountMax;
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
    const account = await this.prisma.cashAccount.findFirst({
      where: { id: dto.accountId, tenantId },
    });
    if (!account) throw new NotFoundException('Cash account not found');

    const tx = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.financeTransaction.create({
        data: {
          tenantId,
          direction: TransactionDirection.INCOME,
          accountId: dto.accountId,
          amount: dto.amount,
          currency: dto.currency,
          transactionDate: dto.transactionDate
            ? new Date(dto.transactionDate)
            : new Date(),
          counterpartyId: dto.counterpartyId,
          transactionTypeId: dto.transactionTypeId,
          comment: dto.comment,
          sourceDocType: dto.sourceDocType,
          sourceDocId: dto.sourceDocId,
          createdById,
        },
        include: { account: true, counterparty: true, transactionType: true },
      });

      // Update account balance
      await tx.cashAccount.update({
        where: { id: dto.accountId },
        data: { balance: { increment: dto.amount } },
      });

      // Update counterparty debt (reduce debt if they pay us)
      if (dto.counterpartyId) {
        await tx.counterparty.update({
          where: { id: dto.counterpartyId },
          data: { debtBalance: { decrement: dto.amount } },
        });

        // 1. Direct Invoice Settlement
        if (dto.sourceDocType === 'SalesInvoice' && dto.sourceDocId) {
          const invoice = await tx.salesInvoice.findFirst({
            where: { id: dto.sourceDocId, tenantId },
          });
          if (invoice) {
            const newPaid = Number(invoice.paidAmount) + Number(dto.amount);
            const total = Number(invoice.totalAmount);
            const paymentStatus =
              newPaid >= total
                ? SalesPaymentStatus.PAID
                : newPaid > 0
                ? SalesPaymentStatus.PARTIALLY_PAID
                : SalesPaymentStatus.UNPAID;

            await tx.salesInvoice.update({
              where: { id: invoice.id },
              data: { paidAmount: newPaid, paymentStatus },
            });
          }
        } else if (!dto.sourceDocId) {
          // 2. FIFO Auto-Allocation across open unpaid/partially-paid sales invoices
          const openInvoices = await tx.salesInvoice.findMany({
            where: {
              tenantId,
              counterpartyId: dto.counterpartyId,
              status: SalesDocStatus.POSTED,
              paymentStatus: {
                in: [SalesPaymentStatus.UNPAID, SalesPaymentStatus.PARTIALLY_PAID],
              },
            },
            orderBy: { invoiceDate: 'asc' },
          });

          let remainingPayment = Number(dto.amount);
          for (const invoice of openInvoices) {
            if (remainingPayment <= 0) break;
            const remainingDebt =
              Number(invoice.totalAmount) - Number(invoice.paidAmount);
            const allocate = Math.min(remainingDebt, remainingPayment);
            const newPaid = Number(invoice.paidAmount) + allocate;
            const paymentStatus =
              newPaid >= Number(invoice.totalAmount)
                ? SalesPaymentStatus.PAID
                : SalesPaymentStatus.PARTIALLY_PAID;

            await tx.salesInvoice.update({
              where: { id: invoice.id },
              data: { paidAmount: newPaid, paymentStatus },
            });
            remainingPayment -= allocate;
          }
        }
      }

      return transaction;
    });

    return tx;
  }

  // ─── Create Expense ───────────────────────────────────────────

  async createExpense(
    tenantId: string,
    dto: CreateExpenseDto,
    createdById?: string,
  ) {
    const account = await this.prisma.cashAccount.findFirst({
      where: { id: dto.accountId, tenantId },
    });
    if (!account) throw new NotFoundException('Cash account not found');

    const tx = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.financeTransaction.create({
        data: {
          tenantId,
          direction: TransactionDirection.EXPENSE,
          accountId: dto.accountId,
          amount: dto.amount,
          currency: dto.currency,
          transactionDate: dto.transactionDate
            ? new Date(dto.transactionDate)
            : new Date(),
          counterpartyId: dto.counterpartyId,
          transactionTypeId: dto.transactionTypeId,
          comment: dto.comment,
          sourceDocType: dto.sourceDocType,
          sourceDocId: dto.sourceDocId,
          createdById,
        },
        include: { account: true, counterparty: true, transactionType: true },
      });

      // Update account balance (decrease)
      await tx.cashAccount.update({
        where: { id: dto.accountId },
        data: { balance: { decrement: dto.amount } },
      });

      // Update counterparty debt (reduce our debt to them)
      if (dto.counterpartyId) {
        await tx.counterparty.update({
          where: { id: dto.counterpartyId },
          data: { debtBalance: { increment: dto.amount } },
        });
      }

      return transaction;
    });

    return tx;
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
        where: { id: dto.fromAccountId, tenantId },
      }),
      this.prisma.cashAccount.findFirst({
        where: { id: dto.toAccountId, tenantId },
      }),
    ]);

    if (!fromAccount)
      throw new NotFoundException('Chiquvchi kassa hisobi topilmadi');
    if (!toAccount)
      throw new NotFoundException('Qabul qiluvchi kassa hisobi topilmadi');

    const fromAmount = Number(dto.amount);
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
    let autoComment = dto.comment || '';

    if (fromCurrency !== toCurrency) {
      if (dto.targetAmount && dto.targetAmount > 0) {
        toAmount = Number(dto.targetAmount);
      } else if (dto.exchangeRate && dto.exchangeRate > 0) {
        toAmount = fromAmount * Number(dto.exchangeRate);
      } else {
        throw new BadRequestException(
          `Turli valyutadagi hisoblar uchun konvertatsiya kursi yoki yakuniy summa kiritilishi shart (${fromCurrency} -> ${toCurrency})`,
        );
      }

      const calcRate = dto.exchangeRate || toAmount / fromAmount;
      const conversionNote = `Konvertatsiya: ${fromAmount} ${fromCurrency} -> ${toAmount} ${toCurrency} (Kurs: ${calcRate})`;
      autoComment = autoComment
        ? `${autoComment} | ${conversionNote}`
        : conversionNote;
    }

    const tx = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.financeTransaction.create({
        data: {
          tenantId,
          direction: TransactionDirection.TRANSFER,
          accountId: dto.fromAccountId,
          transferToId: dto.toAccountId,
          amount: fromAmount,
          currency: fromCurrency,
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

  // ─── Delete Transaction ───────────────────────────────────────

  async deleteTransaction(tenantId: string, id: string) {
    const existing = await this.prisma.financeTransaction.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Transaction not found');

    // Soft-delete and reverse the balance change
    await this.prisma.$transaction(async (tx) => {
      await tx.financeTransaction.update({
        where: { id },
        data: { isDeleted: true },
      });

      if (existing.accountId) {
        if (existing.direction === TransactionDirection.INCOME) {
          await tx.cashAccount.update({
            where: { id: existing.accountId },
            data: { balance: { decrement: Number(existing.amount) } },
          });
          if (existing.counterpartyId) {
            await tx.counterparty.update({
              where: { id: existing.counterpartyId },
              data: { debtBalance: { increment: Number(existing.amount) } },
            });
          }
          if (existing.sourceDocType === 'SalesInvoice' && existing.sourceDocId) {
            const invoice = await tx.salesInvoice.findFirst({
              where: { id: existing.sourceDocId, tenantId },
            });
            if (invoice) {
              const newPaid = Math.max(
                0,
                Number(invoice.paidAmount) - Number(existing.amount),
              );
              const total = Number(invoice.totalAmount);
              const paymentStatus =
                newPaid <= 0
                  ? SalesPaymentStatus.UNPAID
                  : newPaid >= total
                  ? SalesPaymentStatus.PAID
                  : SalesPaymentStatus.PARTIALLY_PAID;
              await tx.salesInvoice.update({
                where: { id: invoice.id },
                data: { paidAmount: newPaid, paymentStatus },
              });
            }
          }
        } else if (existing.direction === TransactionDirection.EXPENSE) {
          await tx.cashAccount.update({
            where: { id: existing.accountId },
            data: { balance: { increment: Number(existing.amount) } },
          });
          if (existing.counterpartyId) {
            await tx.counterparty.update({
              where: { id: existing.counterpartyId },
              data: { debtBalance: { decrement: Number(existing.amount) } },
            });
          }
        } else if (existing.direction === TransactionDirection.TRANSFER) {
          await tx.cashAccount.update({
            where: { id: existing.accountId },
            data: { balance: { increment: Number(existing.amount) } },
          });
          if (existing.transferToId) {
            await tx.cashAccount.update({
              where: { id: existing.transferToId },
              data: { balance: { decrement: Number(existing.amount) } },
            });
          }
        }
      }
    });

    return { success: true, id };
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
