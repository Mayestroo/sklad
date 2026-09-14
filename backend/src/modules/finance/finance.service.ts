import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import {
  TransactionDirection,
  TransactionStatus,
  SalesDocStatus,
  SalesPaymentStatus,
  PurchaseDocStatus,
  PurchasePaymentStatus,
  ServicePaymentStatus,
} from '@prisma/client';
import { CreateIncomeDto } from './dto/create-income.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { FilterTransactionsDto } from './dto/filter-transactions.dto';
import { CancelTransactionDto } from './dto/cancel-transaction.dto';

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
      where.currency = filters.currency;
    }

    const transactions = await this.prisma.financeTransaction.findMany({
      where,
      select: { direction: true, amount: true, currency: true },
    });

    const byCurrency: Record<string, { income: number; expense: number }> = {};

    for (const tx of transactions) {
      if (tx.direction === TransactionDirection.TRANSFER) continue;
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

    for (const acc of accounts) {
      const bal = Number(acc.balance || 0);
      if (acc.accountType === 'USD_CASH') dollarKassa += bal;
      else if (acc.accountType === 'UZS_CASH') naqdKassa += bal;
      else if (acc.accountType === 'BANK') hisobRaqam += bal;
    }

    // Today's and Monthly transactions
    const txs = await this.prisma.financeTransaction.findMany({
      where: {
        tenantId,
        isDeleted: false,
        status: TransactionStatus.POSTED,
        transactionDate: { gte: startOfMonth },
      },
      select: {
        direction: true,
        amount: true,
        currency: true,
        transactionDate: true,
      },
    });

    let todayIncomeUZS = 0;
    let todayExpenseUZS = 0;
    let monthIncomeUZS = 0;
    let monthExpenseUZS = 0;

    for (const tx of txs) {
      if (tx.direction === TransactionDirection.TRANSFER) continue;
      const amt = Number(tx.amount || 0);
      const isToday = new Date(tx.transactionDate) >= startOfToday;

      if (tx.direction === TransactionDirection.INCOME) {
        monthIncomeUZS += amt;
        if (isToday) todayIncomeUZS += amt;
      } else if (tx.direction === TransactionDirection.EXPENSE) {
        monthExpenseUZS += amt;
        if (isToday) todayExpenseUZS += amt;
      }
    }

    // Counterparty Debts
    const counterparties = await this.prisma.counterparty.findMany({
      where: { tenantId },
      select: { customerDebt: true, supplierDebt: true, debtBalance: true, type: true },
    });

    let totalCustomerDebt = 0; // Receivables (Kutilayotgan tushumlar)
    let totalSupplierDebt = 0; // Payables (To'lanishi kerak bo'lgan qarzlar)

    for (const cp of counterparties) {
      const cDebt = Number((cp as any).customerDebt || 0);
      const sDebt = Number((cp as any).supplierDebt || 0);
      if (cDebt > 0 || sDebt > 0) {
        totalCustomerDebt += cDebt;
        totalSupplierDebt += sDebt;
      } else {
        const raw = Number(cp.debtBalance || 0);
        if (cp.type === 'SUPPLIER') {
          if (raw > 0) totalSupplierDebt += raw;
        } else {
          if (raw > 0) totalCustomerDebt += raw;
        }
      }
    }

    return {
      balances: {
        dollarKassa,
        naqdKassa,
        hisobRaqam,
        totalLiquidUZSEquivalent: naqdKassa + hisobRaqam, // primary UZS
      },
      today: {
        income: todayIncomeUZS,
        expense: todayExpenseUZS,
        netCashFlow: todayIncomeUZS - todayExpenseUZS,
      },
      month: {
        income: monthIncomeUZS,
        expense: monthExpenseUZS,
        netCashFlow: monthIncomeUZS - monthExpenseUZS,
      },
      debts: {
        receivables: totalCustomerDebt,
        payables: totalSupplierDebt,
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
          status: TransactionStatus.POSTED,
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
          responsibleUserId: dto.responsibleUserId,
          createdById,
        },
        include: { account: true, counterparty: true, transactionType: true },
      });

      // 1. Update cash account balance
      await tx.cashAccount.update({
        where: { id: dto.accountId },
        data: { balance: { increment: dto.amount } },
      });

      // 2. Update counterparty customer debt
      if (dto.counterpartyId) {
        await tx.counterparty.update({
          where: { id: dto.counterpartyId },
          data: {
            customerDebt: { decrement: dto.amount },
            debtBalance: { decrement: dto.amount },
          },
        });

        // 3. Direct Sales Invoice Settlement
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
        }
        // 4. Direct Sales Order Pre-Payment Settlement
        else if (dto.sourceDocType === 'SalesOrder' && dto.sourceDocId) {
          const order = await tx.salesOrder.findFirst({
            where: { id: dto.sourceDocId, tenantId },
          });
          if (order) {
            const newPaid = Number(order.paidAmount) + Number(dto.amount);
            const total = Number(order.totalAmount);
            let newStatus = order.status;

            if (order.status === 'AWAITING_PAYMENT') {
              if (order.paymentCondition === 'PREPAID_100' && newPaid >= total) {
                newStatus = 'PAYMENT_CONFIRMED';
              } else if (order.paymentCondition === 'PARTIAL') {
                const reqPercent = Number(order.requiredPaymentPercent || 50);
                const reqAmount = (total * reqPercent) / 100;
                if (newPaid >= reqAmount) {
                  newStatus = 'PAYMENT_CONFIRMED';
                }
              }
            }

            await tx.salesOrder.update({
              where: { id: order.id },
              data: { paidAmount: newPaid, status: newStatus },
            });
          }
        }
        // 5. Direct ServiceAct Settlement
        else if (dto.sourceDocType === 'ServiceAct' && dto.sourceDocId) {
          const act = await tx.serviceAct.findFirst({
            where: { id: dto.sourceDocId, tenantId },
          });
          if (act) {
            const newPaid = Number(act.paidAmount) + Number(dto.amount);
            const total = Number(act.totalAmount);
            const paymentStatus =
              newPaid >= total
                ? ServicePaymentStatus.PAID
                : newPaid > 0
                ? ServicePaymentStatus.PARTIALLY_PAID
                : ServicePaymentStatus.UNPAID;

            await tx.serviceAct.update({
              where: { id: act.id },
              data: { paidAmount: newPaid, paymentStatus },
            });
          }
        }
        // 6. FIFO Auto-Allocation across open unpaid/partially-paid sales invoices
        else if (!dto.sourceDocId) {
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

    // Invariant: Cash account cannot go negative
    if (Number(account.balance) < Number(dto.amount)) {
      throw new BadRequestException(
        `Chiquvchi kassada mablag' yetarli emas. Mavjud: ${account.balance} ${account.currency}, so'ralgan: ${dto.amount} ${dto.currency}`,
      );
    }

    const tx = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.financeTransaction.create({
        data: {
          tenantId,
          direction: TransactionDirection.EXPENSE,
          status: TransactionStatus.POSTED,
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
          responsibleUserId: dto.responsibleUserId,
          createdById,
        },
        include: { account: true, counterparty: true, transactionType: true },
      });

      // 1. Update account balance (decrease)
      await tx.cashAccount.update({
        where: { id: dto.accountId },
        data: { balance: { decrement: dto.amount } },
      });

      // 2. Update counterparty supplier debt
      if (dto.counterpartyId) {
        await tx.counterparty.update({
          where: { id: dto.counterpartyId },
          data: {
            supplierDebt: { decrement: dto.amount },
            debtBalance: { decrement: dto.amount },
          },
        });

        // 3. Direct Purchase Receipt Settlement
        if (dto.sourceDocType === 'PurchaseReceipt' && dto.sourceDocId) {
          const receipt = await tx.purchaseReceipt.findFirst({
            where: { id: dto.sourceDocId, tenantId },
          });
          if (receipt) {
            const newPaid = Number(receipt.paidAmount) + Number(dto.amount);
            const total = Number(receipt.totalAmount);
            const paymentStatus =
              newPaid >= total
                ? PurchasePaymentStatus.PAID
                : newPaid > 0
                ? PurchasePaymentStatus.PARTIALLY_PAID
                : PurchasePaymentStatus.UNPAID;

            await tx.purchaseReceipt.update({
              where: { id: receipt.id },
              data: { paidAmount: newPaid, paymentStatus },
            });
          }
        }
        // 4. Direct ServiceAct Settlement (for RECEIVED services)
        else if (dto.sourceDocType === 'ServiceAct' && dto.sourceDocId) {
          const act = await tx.serviceAct.findFirst({
            where: { id: dto.sourceDocId, tenantId },
          });
          if (act) {
            const newPaid = Number(act.paidAmount) + Number(dto.amount);
            const total = Number(act.totalAmount);
            const paymentStatus =
              newPaid >= total
                ? ServicePaymentStatus.PAID
                : newPaid > 0
                ? ServicePaymentStatus.PARTIALLY_PAID
                : ServicePaymentStatus.UNPAID;

            await tx.serviceAct.update({
              where: { id: act.id },
              data: { paidAmount: newPaid, paymentStatus },
            });
          }
        }
        // 5. FIFO Auto-Allocation across open purchase receipts
        else if (!dto.sourceDocId) {
          const openReceipts = await tx.purchaseReceipt.findMany({
            where: {
              tenantId,
              counterpartyId: dto.counterpartyId,
              status: PurchaseDocStatus.POSTED,
              paymentStatus: {
                in: [PurchasePaymentStatus.UNPAID, PurchasePaymentStatus.PARTIALLY_PAID],
              },
            },
            orderBy: { docDate: 'asc' },
          });

          let remainingPayment = Number(dto.amount);
          for (const receipt of openReceipts) {
            if (remainingPayment <= 0) break;
            const remainingDebt =
              Number(receipt.totalAmount) - Number(receipt.paidAmount);
            const allocate = Math.min(remainingDebt, remainingPayment);
            const newPaid = Number(receipt.paidAmount) + allocate;
            const paymentStatus =
              newPaid >= Number(receipt.totalAmount)
                ? PurchasePaymentStatus.PAID
                : PurchasePaymentStatus.PARTIALLY_PAID;

            await tx.purchaseReceipt.update({
              where: { id: receipt.id },
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
          status: TransactionStatus.POSTED,
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

    const amount = Number(existing.amount);

    await this.prisma.$transaction(async (tx) => {
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

        // Restore counterparty customer debt
        if (existing.counterpartyId) {
          await tx.counterparty.update({
            where: { id: existing.counterpartyId },
            data: {
              customerDebt: { increment: amount },
              debtBalance: { increment: amount },
            },
          });
        }

        // Revert SalesInvoice paidAmount
        if (existing.sourceDocType === 'SalesInvoice' && existing.sourceDocId) {
          const invoice = await tx.salesInvoice.findFirst({
            where: { id: existing.sourceDocId, tenantId },
          });
          if (invoice) {
            const newPaid = Math.max(0, Number(invoice.paidAmount) - amount);
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
        // Revert SalesOrder paidAmount
        else if (existing.sourceDocType === 'SalesOrder' && existing.sourceDocId) {
          const order = await tx.salesOrder.findFirst({
            where: { id: existing.sourceDocId, tenantId },
          });
          if (order) {
            const newPaid = Math.max(0, Number(order.paidAmount) - amount);
            let newStatus = order.status;
            if (order.status === 'PAYMENT_CONFIRMED') {
              const total = Number(order.totalAmount);
              if (order.paymentCondition === 'PREPAID_100' && newPaid < total) {
                newStatus = 'AWAITING_PAYMENT';
              } else if (order.paymentCondition === 'PARTIAL') {
                const reqPercent = Number(order.requiredPaymentPercent || 50);
                if (newPaid < (total * reqPercent) / 100) {
                  newStatus = 'AWAITING_PAYMENT';
                }
              }
            }
            await tx.salesOrder.update({
              where: { id: order.id },
              data: { paidAmount: newPaid, status: newStatus },
            });
          }
        }
        // Revert ServiceAct paidAmount
        else if (existing.sourceDocType === 'ServiceAct' && existing.sourceDocId) {
          const act = await tx.serviceAct.findFirst({
            where: { id: existing.sourceDocId, tenantId },
          });
          if (act) {
            const newPaid = Math.max(0, Number(act.paidAmount) - amount);
            const total = Number(act.totalAmount);
            const paymentStatus =
              newPaid <= 0
                ? ServicePaymentStatus.UNPAID
                : newPaid >= total
                ? ServicePaymentStatus.PAID
                : ServicePaymentStatus.PARTIALLY_PAID;
            await tx.serviceAct.update({
              where: { id: act.id },
              data: { paidAmount: newPaid, paymentStatus },
            });
          }
        }
      } else if (existing.direction === TransactionDirection.EXPENSE) {
        // Return money to account
        if (existing.accountId) {
          await tx.cashAccount.update({
            where: { id: existing.accountId },
            data: { balance: { increment: amount } },
          });
        }

        // Restore counterparty supplier debt
        if (existing.counterpartyId) {
          await tx.counterparty.update({
            where: { id: existing.counterpartyId },
            data: {
              supplierDebt: { increment: amount },
              debtBalance: { increment: amount },
            },
          });
        }

        // Revert PurchaseReceipt paidAmount
        if (existing.sourceDocType === 'PurchaseReceipt' && existing.sourceDocId) {
          const receipt = await tx.purchaseReceipt.findFirst({
            where: { id: existing.sourceDocId, tenantId },
          });
          if (receipt) {
            const newPaid = Math.max(0, Number(receipt.paidAmount) - amount);
            const total = Number(receipt.totalAmount);
            const paymentStatus =
              newPaid <= 0
                ? PurchasePaymentStatus.UNPAID
                : newPaid >= total
                ? PurchasePaymentStatus.PAID
                : PurchasePaymentStatus.PARTIALLY_PAID;
            await tx.purchaseReceipt.update({
              where: { id: receipt.id },
              data: { paidAmount: newPaid, paymentStatus },
            });
          }
        }
        // Revert ServiceAct paidAmount
        else if (existing.sourceDocType === 'ServiceAct' && existing.sourceDocId) {
          const act = await tx.serviceAct.findFirst({
            where: { id: existing.sourceDocId, tenantId },
          });
          if (act) {
            const newPaid = Math.max(0, Number(act.paidAmount) - amount);
            const total = Number(act.totalAmount);
            const paymentStatus =
              newPaid <= 0
                ? ServicePaymentStatus.UNPAID
                : newPaid >= total
                ? ServicePaymentStatus.PAID
                : ServicePaymentStatus.PARTIALLY_PAID;
            await tx.serviceAct.update({
              where: { id: act.id },
              data: { paidAmount: newPaid, paymentStatus },
            });
          }
        }
      } else if (existing.direction === TransactionDirection.TRANSFER) {
        if (existing.transferToId) {
          const toAcc = await tx.cashAccount.findUnique({
            where: { id: existing.transferToId },
          });
          if (!toAcc || Number(toAcc.balance) < amount) {
            throw new BadRequestException(
              "O'tkazmani bekor qilish imkonsiz: qabul qiluvchi kassada yetarli qoldiq mavjud emas",
            );
          }
          await tx.cashAccount.update({
            where: { id: existing.transferToId },
            data: { balance: { decrement: amount } },
          });
        }
        if (existing.accountId) {
          await tx.cashAccount.update({
            where: { id: existing.accountId },
            data: { balance: { increment: amount } },
          });
        }
      }

      // Mark transaction status CANCELLED
      await tx.financeTransaction.update({
        where: { id },
        data: {
          status: TransactionStatus.CANCELLED,
          cancelledById: cancelledById || null,
          cancelledAt: new Date(),
          cancellationReason: dto?.reason || null,
        },
      });
    });

    return { success: true, id, status: TransactionStatus.CANCELLED };
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

  async deleteTransaction(tenantId: string, id: string) {
    return this.cancelTransaction(tenantId, id);
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
