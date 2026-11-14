import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { lockDocumentStatus } from '../../common/prisma/lock-document';
import {
  CreateAdditionalExpenseDto,
  UpdateAdditionalExpenseDto,
} from './dto/create-additional-expense.dto';
import { FilterAdditionalExpensesDto } from './dto/filter-additional-expenses.dto';
import { CalculateAllocationDto } from './dto/calculate-allocation.dto';
import {
  Prisma,
  PurchaseDocStatus,
  ExpenseAllocationMethod,
  TransactionDirection,
  CounterpartySettlementSide,
} from '@prisma/client';

import { nextDocumentNumber } from '../../common/sequences/document-sequence';
import { grossProfitInUzs } from '../sales/sales-calculations';
import { ExpenseAllocationEngine } from './expense-allocation.engine';
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
} from '../../common/validators/currency.validator';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { AccountsService } from '../accounting/accounts/accounts.service';
import {
  isCashAccountCurrencyValid,
  ledgerAccountCodeForCashAccount,
} from '../../../../shared/types/cash-account-policy';
import { requireExchangeRateForCurrency } from '../../common/utils/transaction-exchange-rate';
import { JournalService } from '../accounting/journal/journal.service';
import type { JournalLineDto } from '../accounting/dto';
import { assertTenantOwned } from '../../common/prisma/assert-tenant-owned';
import { formatMoney } from '../../../../shared/format/money';
import { assertPeriodOpen } from '../../common/accounting-period/period-lock';

/** A posted sales invoice whose COGS a posted expense changed retroactively. */
export interface RetroactiveSalesImpact {
  invoiceId: string;
  invoiceNumber: string | undefined;
  invoiceDate: Date | undefined;
  customerName: string | undefined;
  totalDeltaCogs: number;
  items: {
    productId: string;
    productName: Prisma.JsonValue | undefined;
    quantity: number;
    unitDelta: number;
    cogsDelta: number;
  }[];
}

@Injectable()
export class AdditionalExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: CounterpartySettlementService,
    private readonly accountsService: AccountsService,
    private readonly journalService: JournalService,
  ) {}

  // ─── DOCUMENT NUMBER GENERATOR ──────────────────────────────

  private async generateDocNumber(tenantId: string): Promise<string> {
    return nextDocumentNumber(this.prisma, tenantId, 'ADDITIONAL_EXPENSE');
  }

  // ─── ALLOCATION CALCULATION ENGINE ──────────────────────────

  async calculateAllocationPreview(
    tenantId: string,
    dto: CalculateAllocationDto,
  ) {
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id: dto.receiptId, tenantId },
      include: {
        items: {
          include: { product: true },
        },
        batches: {
          include: { consumptions: true },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException('Xarid hujjati topilmadi');
    }

    let targetItems = receipt.items;
    if (dto.selectedItemIds && dto.selectedItemIds.length > 0) {
      const selectedSet = new Set(dto.selectedItemIds);
      targetItems = receipt.items.filter((i) => selectedSet.has(i.id));
    }

    if (targetItems.length === 0) {
      throw new BadRequestException(
        'Taqsimlash uchun kamida bitta tovar tanlanishi shart',
      );
    }

    const allocationMethod =
      dto.allocationMethod || ExpenseAllocationMethod.BY_AMOUNT;
    const totalAmount = Number(dto.amount);

    return ExpenseAllocationEngine.allocateExpense(
      targetItems,
      totalAmount,
      allocationMethod,
      receipt.batches,
    );
  }

  // ─── DRAFT CRUD ─────────────────────────────────────────────

  async createDraft(
    tenantId: string,
    userId: string,
    dto: CreateAdditionalExpenseDto,
  ) {
    if (!dto.currency || !isSupportedCurrency(dto.currency)) {
      throw new BadRequestException(
        `Valyuta ko'rsatilishi shart va faqat quyidagilardan biri bo'lishi mumkin: ${SUPPORTED_CURRENCIES.join(', ')}`,
      );
    }

    let exchangeRate = 1;
    if (dto.currency !== 'UZS') {
      if (
        dto.exchangeRate == null ||
        isNaN(Number(dto.exchangeRate)) ||
        Number(dto.exchangeRate) <= 0
      ) {
        throw new BadRequestException(
          "Xorijiy valyutada kurs (exchangeRate) 0 dan katta bo'lishi shart",
        );
      }
      exchangeRate = Number(dto.exchangeRate);
    }

    if (
      dto.amount == null ||
      isNaN(Number(dto.amount)) ||
      Number(dto.amount) <= 0
    ) {
      throw new BadRequestException(
        "Xarajat summasi (amount) 0 dan katta bo'lishi shart",
      );
    }

    await assertTenantOwned(this.prisma, tenantId, {
      counterparty: dto.counterpartyId,
      cashAccount: dto.cashAccountId,
    });

    const docNumber = await this.generateDocNumber(tenantId);
    const allocation = await this.calculateAllocationPreview(tenantId, {
      receiptId: dto.receiptId,
      amount: dto.amount,
      allocationMethod: dto.allocationMethod,
      selectedItemIds: dto.selectedItemIds,
    });

    const docDate = dto.docDate ? new Date(dto.docDate) : new Date();
    const vatRate = dto.vatRate || 0;
    const vatAmount =
      vatRate > 0 ? (Number(dto.amount) * vatRate) / (100 + vatRate) : 0;

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.additionalExpense.create({
        data: {
          tenantId,
          docNumber,
          docDate,
          status: PurchaseDocStatus.DRAFT,
          expenseType: dto.expenseType,
          counterpartyId: dto.counterpartyId,
          receiptId: dto.receiptId,
          amount: dto.amount,
          currency: dto.currency,
          exchangeRate,
          vatRate,
          vatAmount,
          allocationMethod:
            dto.allocationMethod || ExpenseAllocationMethod.BY_AMOUNT,
          isPaid: dto.isPaid || false,
          cashAccountId: dto.cashAccountId || null,
          comment: dto.comment || null,
          createdById: userId,
          items: {
            create: allocation.items.map((i) => ({
              receiptItemId: i.receiptItemId,
              productId: i.productId,
              initialLandedCost: i.initialLandedCost,
              allocatedAmount: i.allocatedAmount,
              newLandedCost: i.newLandedCost,
              soldQuantity: i.soldQuantity,
              remainingQuantity: i.remainingQuantity,
              cogsAdjustment: i.cogsAdjustment,
            })),
          },
        },
        include: {
          counterparty: true,
          receipt: { include: { counterparty: true, warehouse: true } },
          cashAccount: true,
          createdBy: true,
          items: {
            include: { product: true },
          },
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'AdditionalExpense',
          entityId: expense.id,
          action: 'CREATE',
          newValue: {
            docNumber: expense.docNumber,
            amount: expense.amount,
            status: expense.status,
          },
        },
      });

      return expense;
    });
  }

  async updateDraft(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateAdditionalExpenseDto,
  ) {
    const existing = await this.prisma.additionalExpense.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundException('Qo‘shimcha xarajat hujjati topilmadi');
    }

    if (existing.status !== PurchaseDocStatus.DRAFT) {
      throw new BadRequestException(
        'Faqat qoralama holatidagi xarajatlarni tahrirlash mumkin',
      );
    }

    await assertTenantOwned(this.prisma, tenantId, {
      counterparty: dto.counterpartyId,
      cashAccount: dto.cashAccountId,
    });

    const receiptId = dto.receiptId || existing.receiptId;
    const amount =
      dto.amount !== undefined ? Number(dto.amount) : Number(existing.amount);
    if (amount <= 0 || isNaN(amount)) {
      throw new BadRequestException(
        "Xarajat summasi (amount) 0 dan katta bo'lishi shart",
      );
    }

    const targetCurrency = dto.currency || existing.currency;
    if (!isSupportedCurrency(targetCurrency)) {
      throw new BadRequestException(
        `Valyuta ko'rsatilishi shart va faqat quyidagilardan biri bo'lishi mumkin: ${SUPPORTED_CURRENCIES.join(', ')}`,
      );
    }

    let exchangeRate = Number(existing.exchangeRate);
    if (targetCurrency !== 'UZS') {
      const rateToCheck =
        dto.exchangeRate !== undefined
          ? Number(dto.exchangeRate)
          : exchangeRate;
      if (isNaN(rateToCheck) || rateToCheck <= 0) {
        throw new BadRequestException(
          "Xorijiy valyutada kurs (exchangeRate) 0 dan katta bo'lishi shart",
        );
      }
      exchangeRate = rateToCheck;
    } else {
      exchangeRate = 1;
    }

    const allocationMethod = dto.allocationMethod || existing.allocationMethod;

    const allocation = await this.calculateAllocationPreview(tenantId, {
      receiptId,
      amount,
      allocationMethod,
      selectedItemIds: dto.selectedItemIds,
    });

    const vatRate =
      dto.vatRate !== undefined ? dto.vatRate : Number(existing.vatRate);
    const vatAmount = vatRate > 0 ? (amount * vatRate) / (100 + vatRate) : 0;

    return this.prisma.$transaction(async (tx) => {
      // F9: lock the row and re-check the status inside the transaction; a
      // post committed after the check above must not have its lines replaced.
      const lockedStatus = await lockDocumentStatus(
        tx,
        'additionalExpense',
        id,
        tenantId,
      );
      if (lockedStatus === null) {
        throw new NotFoundException('Qo‘shimcha xarajat hujjati topilmadi');
      }
      if (lockedStatus !== PurchaseDocStatus.DRAFT) {
        throw new BadRequestException(
          'Faqat qoralama holatidagi xarajatlarni tahrirlash mumkin',
        );
      }
      await tx.additionalExpenseItem.deleteMany({
        where: { expense: { tenantId }, expenseId: id },
      });

      const updated = await tx.additionalExpense.update({
        where: { tenantId, id },
        data: {
          docDate: dto.docDate ? new Date(dto.docDate) : existing.docDate,
          expenseType: dto.expenseType || existing.expenseType,
          counterpartyId: dto.counterpartyId || existing.counterpartyId,
          receiptId,
          amount,
          currency: dto.currency || existing.currency,
          exchangeRate,
          vatRate,
          vatAmount,
          allocationMethod,
          isPaid: dto.isPaid !== undefined ? dto.isPaid : existing.isPaid,
          cashAccountId:
            dto.cashAccountId !== undefined
              ? dto.cashAccountId
              : existing.cashAccountId,
          comment: dto.comment !== undefined ? dto.comment : existing.comment,
          items: {
            create: allocation.items.map((i) => ({
              receiptItemId: i.receiptItemId,
              productId: i.productId,
              initialLandedCost: i.initialLandedCost,
              allocatedAmount: i.allocatedAmount,
              newLandedCost: i.newLandedCost,
              soldQuantity: i.soldQuantity,
              remainingQuantity: i.remainingQuantity,
              cogsAdjustment: i.cogsAdjustment,
            })),
          },
        },
        include: {
          counterparty: true,
          receipt: { include: { counterparty: true, warehouse: true } },
          cashAccount: true,
          items: { include: { product: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'AdditionalExpense',
          entityId: id,
          action: 'UPDATE',
          oldValue: { amount: existing.amount },
          newValue: { amount: updated.amount },
        },
      });

      return updated;
    });
  }

  async deleteDraft(tenantId: string, id: string) {
    const existing = await this.prisma.additionalExpense.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Qo‘shimcha xarajat hujjati topilmadi');
    }

    if (
      existing.status !== PurchaseDocStatus.DRAFT &&
      existing.status !== PurchaseDocStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Faqat qoralama yoki bekor qilingan xarajatlarni o‘chirish mumkin. Avval bekor qiling.',
      );
    }

    await this.prisma.additionalExpenseItem.deleteMany({
      where: { expense: { tenantId }, expenseId: id },
    });

    await this.prisma.additionalExpense.delete({ where: { tenantId, id } });

    return {
      success: true,
      message: 'Qo‘shimcha xarajat hujjati o‘chirildi',
    };
  }

  // ─── QUERY & FIND ───────────────────────────────────────────

  async findAll(tenantId: string, filters: FilterAdditionalExpensesDto) {
    const {
      search,
      status,
      expenseType,
      counterpartyId,
      receiptId,
      currency,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      page = 1,
      limit = 20,
    } = filters;

    const where: Prisma.AdditionalExpenseWhereInput = {
      tenantId,
    };

    if (search) {
      where.OR = [
        { docNumber: { contains: search, mode: 'insensitive' } },
        { comment: { contains: search, mode: 'insensitive' } },
        { counterparty: { name: { contains: search, mode: 'insensitive' } } },
        { receipt: { docNumber: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) where.status = status;
    if (expenseType) where.expenseType = expenseType;
    if (counterpartyId) where.counterpartyId = counterpartyId;
    if (receiptId) where.receiptId = receiptId;
    if (currency) where.currency = currency;

    if (dateFrom || dateTo) {
      where.docDate = {};
      if (dateFrom) where.docDate.gte = new Date(dateFrom);
      if (dateTo) where.docDate.lte = new Date(dateTo);
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {};
      if (minAmount !== undefined) where.amount.gte = minAmount;
      if (maxAmount !== undefined) where.amount.lte = maxAmount;
    }

    const [items, total] = await Promise.all([
      this.prisma.additionalExpense.findMany({
        where,
        include: {
          counterparty: true,
          receipt: {
            include: { counterparty: true, warehouse: true },
          },
          cashAccount: true,
          createdBy: true,
          postedBy: true,
          items: {
            include: { product: true },
          },
        },
        orderBy: { docDate: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.additionalExpense.count({ where }),
    ]);

    // KPI Aggregations across all posted expenses
    const allPosted = await this.prisma.additionalExpense.findMany({
      where: { tenantId, status: PurchaseDocStatus.POSTED },
      select: { expenseType: true, amount: true, currency: true },
    });

    // ADR 0023 / F8: one amount per currency, never a cross-currency sum or a guessed label.
    const byCurrency = (type?: string) => {
      const totals = new Map<string, number>();
      for (const e of allPosted) {
        if (type && e.expenseType !== type) continue;
        totals.set(
          e.currency,
          (totals.get(e.currency) ?? 0) + Number(e.amount),
        );
      }
      return [...totals.entries()]
        .sort(([a], [b]) =>
          a === b ? 0 : a === 'UZS' ? -1 : b === 'UZS' ? 1 : a.localeCompare(b),
        )
        .map(([currency, amount]) => ({
          currency,
          amount: Math.round(amount * 100) / 100,
        }));
    };

    return {
      items,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
      stats: {
        transport: byCurrency('TRANSPORT'),
        customs: byCurrency('CUSTOMS'),
        broker: byCurrency('BROKER'),
        all: byCurrency(),
      },
    };
  }

  async findById(tenantId: string, id: string) {
    const expense = await this.prisma.additionalExpense.findFirst({
      where: { id, tenantId },
      include: {
        counterparty: true,
        receipt: {
          include: {
            counterparty: true,
            warehouse: true,
            items: { include: { product: true } },
          },
        },
        cashAccount: true,
        createdBy: true,
        postedBy: true,
        items: {
          include: {
            product: true,
            receiptItem: true,
          },
        },
      },
    });

    if (!expense) {
      throw new NotFoundException('Qo‘shimcha xarajat hujjati topilmadi');
    }

    // Query retroactive sales impact if posted
    let retroactiveSalesImpact: RetroactiveSalesImpact[] = [];
    if (expense.status === PurchaseDocStatus.POSTED) {
      const productIds = expense.items.map((i) => i.productId);
      const batches = await this.prisma.productBatch.findMany({
        where: {
          tenantId,
          receiptId: expense.receiptId,
          productId: { in: productIds },
        },
        include: {
          consumptions: {
            include: {
              salesInvoiceItem: {
                include: {
                  invoice: {
                    include: { counterparty: true },
                  },
                  product: true,
                },
              },
            },
          },
        },
      });

      const impactMap = new Map<string, RetroactiveSalesImpact>();
      for (const batch of batches) {
        const itemExpense = expense.items.find(
          (i) => i.productId === batch.productId,
        );
        const unitExpense = itemExpense
          ? Number(itemExpense.allocatedAmount) /
            (Number(itemExpense.soldQuantity) +
              Number(itemExpense.remainingQuantity) || 1)
          : 0;

        for (const c of batch.consumptions) {
          const invItem = c.salesInvoiceItem;
          if (!invItem) continue;

          const key = invItem.invoiceId;
          const consumedQty = Number(c.quantity);
          const cogsDelta = consumedQty * unitExpense;

          const existing = impactMap.get(key);
          if (!existing) {
            impactMap.set(key, {
              invoiceId: invItem.invoiceId,
              invoiceNumber: invItem.invoice?.invoiceNumber,
              invoiceDate: invItem.invoice?.invoiceDate,
              customerName: invItem.invoice?.counterparty?.name,
              totalDeltaCogs: cogsDelta,
              items: [
                {
                  productId: invItem.productId,
                  productName: invItem.product?.name,
                  quantity: consumedQty,
                  unitDelta: unitExpense,
                  cogsDelta,
                },
              ],
            });
          } else {
            existing.totalDeltaCogs += cogsDelta;
            existing.items.push({
              productId: invItem.productId,
              productName: invItem.product?.name,
              quantity: consumedQty,
              unitDelta: unitExpense,
              cogsDelta,
            });
          }
        }
      }
      retroactiveSalesImpact = Array.from(impactMap.values());
    }

    return {
      ...expense,
      retroactiveSalesImpact,
    };
  }

  // ─── POSTING & RETROACTIVE RECALIBRATION (TICKET 2 & 3) ───────

  async postExpense(tenantId: string, userId: string, id: string) {
    const expense = await this.prisma.additionalExpense.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { product: true } },
        counterparty: true,
        receipt: { include: { warehouse: true } },
        cashAccount: true,
      },
    });

    if (!expense) {
      throw new NotFoundException('Qo‘shimcha xarajat hujjati topilmadi');
    }

    if (expense.status !== PurchaseDocStatus.DRAFT) {
      throw new BadRequestException(
        'Faqat qoralama holatidagi xarajatlarni tasdiqlash mumkin',
      );
    }
    const paidCashAccountId = expense.cashAccountId;
    if (expense.isPaid && !paidCashAccountId) {
      throw new BadRequestException(
        'To‘langan qo‘shimcha xarajat uchun kassa yoki bank hisobini tanlang',
      );
    }

    await this.accountsService.ensureDefaultAccounts(tenantId);

    const totalAmount = Number(expense.amount);
    // Inventory, COGS, and the general ledger are maintained in UZS base currency.
    const capitalizationRate = requireExchangeRateForCurrency(
      expense.currency,
      expense.currency === 'UZS' ? undefined : Number(expense.exchangeRate),
    );
    const capitalizedTotal = totalAmount * capitalizationRate;

    return this.prisma.$transaction(async (tx) => {
      let totalCogsAdjustment = 0;

      // 1. Update ProductBatch landed cost & Retroactive COGS
      for (const item of expense.items) {
        const allocatedAmount =
          Number(item.allocatedAmount) * capitalizationRate;
        const itemQty =
          Number(item.soldQuantity) + Number(item.remainingQuantity) || 1;
        const allocatedPerUnit = allocatedAmount / itemQty;

        // Find or verify batch
        const batch = await tx.productBatch.findFirst({
          where: {
            tenantId,
            receiptId: expense.receiptId,
            productId: item.productId,
          },
          include: {
            consumptions: {
              include: { salesInvoiceItem: true },
            },
          },
        });

        if (batch) {
          const currentBatchLandedCost =
            Number(batch.landedCost) > 0
              ? Number(batch.landedCost)
              : Number(batch.purchasePrice);
          const newBatchLandedCost = currentBatchLandedCost + allocatedPerUnit;

          await tx.productBatch.update({
            where: { tenantId, id: batch.id },
            data: { landedCost: newBatchLandedCost },
          });

          // Receipt-linked returns use the receipt line as their historical source.
          // Keep it synchronized with the revalued batch cost.
          const receiptItem = await tx.purchaseReceiptItem.findFirst({
            where: {
              receipt: { tenantId },
              receiptId: expense.receiptId,
              productId: item.productId,
            },
          });
          if (receiptItem) {
            await tx.purchaseReceiptItem.update({
              where: { receipt: { tenantId }, id: receiptItem.id },
              data: { landedCost: newBatchLandedCost },
            });
          }

          // Sync Product catalog costPrice (ADR 0007)
          await tx.product.update({
            where: { tenantId, id: item.productId },
            data: {
              costPrice: newBatchLandedCost,
              costPriceCurrency: 'UZS',
              costPriceExchangeRate: 1,
            },
          });

          // Retroactive COGS Recalibration for all downstream consumptions (ADR 0008)
          for (const consumption of batch.consumptions) {
            const consumedQty = Number(consumption.quantity);
            const lineCogsDelta = consumedQty * allocatedPerUnit;

            // Only sales consumptions are COGS; goods returned to the supplier
            // (purchase-return consumptions) are not.
            if (consumption.salesInvoiceItem) {
              totalCogsAdjustment += lineCogsDelta;
              const currentUnitCogs = Number(
                consumption.salesInvoiceItem.unitCogs || 0,
              );
              const currentLineCogs = Number(
                consumption.salesInvoiceItem.lineCogs || 0,
              );
              const newUnitCogs = currentUnitCogs + allocatedPerUnit;
              const newLineCogs = currentLineCogs + lineCogsDelta;
              const invoice = await tx.salesInvoice.findUnique({
                where: { tenantId, id: consumption.salesInvoiceItem.invoiceId },
              });
              if (!invoice) {
                throw new BadRequestException(
                  'Sotuv hujjati topilmadi (tannarxni qayta hisoblash)',
                );
              }
              const newGrossProfit = salesProfitInUzs(
                invoice,
                Number(consumption.salesInvoiceItem.totalPrice) -
                  Number(consumption.salesInvoiceItem.vatAmount || 0),
                newLineCogs,
              );

              await tx.salesInvoiceItem.update({
                where: {
                  invoice: { tenantId },
                  id: consumption.salesInvoiceItem.id,
                },
                data: {
                  unitCogs: newUnitCogs,
                  lineCogs: newLineCogs,
                  lineGrossProfit: newGrossProfit,
                },
              });

              // Recalculate parent sales invoice total cogs & gross profit
              const allInvoiceItems = await tx.salesInvoiceItem.findMany({
                where: {
                  invoice: { tenantId },
                  invoiceId: consumption.salesInvoiceItem.invoiceId,
                },
              });
              const invoiceTotalCogs = allInvoiceItems.reduce((s, it) => {
                if (it.id === consumption.salesInvoiceItemId) {
                  return s + newLineCogs;
                }
                return s + Number(it.lineCogs || 0);
              }, 0);

              const newInvoiceGrossProfit = salesProfitInUzs(
                invoice,
                Number(invoice.totalAmount) - Number(invoice.vatAmount || 0),
                invoiceTotalCogs,
              );

              await tx.salesInvoice.update({
                where: { tenantId, id: consumption.salesInvoiceItem.invoiceId },
                data: {
                  totalCogs: invoiceTotalCogs,
                  grossProfit: newInvoiceGrossProfit,
                },
              });
            }
          }
        }

        // Update item fields
        await tx.additionalExpenseItem.update({
          where: { expense: { tenantId }, id: item.id },
          data: {
            newLandedCost: Number(item.initialLandedCost) + allocatedPerUnit,
            cogsAdjustment:
              (Number(item.soldQuantity) / itemQty) * allocatedAmount,
          },
        });
      }

      // Update PurchaseReceipt total additional expenses
      await tx.purchaseReceipt.update({
        where: { tenantId, id: expense.receiptId },
        data: {
          additionalExpensesTotal: { increment: capitalizedTotal },
        },
      });

      // 2. Financial Settlements
      let paidCashAccount: { accountType: string; currency: string } | null =
        null;
      if (expense.isPaid && paidCashAccountId) {
        const cashAcc = await tx.cashAccount.findFirst({
          where: { id: paidCashAccountId, tenantId, isActive: true },
        });

        if (!cashAcc) {
          throw new NotFoundException('Kassa hisobi topilmadi');
        }
        if (
          !isCashAccountCurrencyValid(cashAcc) ||
          cashAcc.currency !== expense.currency
        ) {
          throw new BadRequestException(
            `Tanlangan kassa turi/valyutasi xarajat valyutasiga (${expense.currency}) mos kelmaydi`,
          );
        }
        paidCashAccount = cashAcc;

        if (Number(cashAcc.balance) < totalAmount) {
          throw new BadRequestException(
            `Kassada mablag' yetarli emas. Mavjud: ${formatMoney(Number(cashAcc.balance), cashAcc.currency)}, Xarajat: ${formatMoney(totalAmount, expense.currency)}`,
          );
        }

        // Decrement cash balance
        await tx.cashAccount.update({
          where: { tenantId, id: paidCashAccountId },
          data: { balance: { decrement: totalAmount } },
        });

        // Create FinanceTransaction EXPENSE
        const txNumber = await nextDocumentNumber(
          tx,
          tenantId,
          'FINANCE_TRANSACTION',
        );

        await tx.financeTransaction.create({
          data: {
            tenantId,
            docNumber: txNumber,
            direction: TransactionDirection.EXPENSE,
            amount: totalAmount,
            currency: cashAcc.currency,
            exchangeRate: capitalizationRate,
            transactionDate: expense.docDate,
            comment:
              expense.comment ||
              `Qo‘shimcha xarajat to‘lovi: ${expense.docNumber} (${expense.counterparty.name})`,
            accountId: paidCashAccountId,
            counterpartyId: expense.counterpartyId,
            sourceDocType: 'AdditionalExpense',
            sourceDocId: expense.id,
            createdById: userId,
          },
        });
      } else {
        // Unpaid additional expenses accrue a supplier payable in their own currency.
        await this.settlementService.recordMovement(tx, {
          tenantId,
          counterpartyId: expense.counterpartyId,
          currency: expense.currency,
          side: CounterpartySettlementSide.SUPPLIER,
          amount: totalAmount,
          entryType: 'ADDITIONAL_EXPENSE_POSTED',
          effectiveAt: expense.docDate,
          sourceDocType: 'AdditionalExpense',
          sourceDocId: expense.id,
          idempotencyKey: `AdditionalExpense:${expense.id}:POSTED`,
        });
      }

      // 3. Automated BHMS / NAS Double-Entry Journal Postings (ADR 0006)
      // Debit 2910 (Inventory / Ombor tovarlari): netStock
      // Debit 9110 (COGS / Sotilgan tovarlar tannarxi): totalCogsAdjustment
      // Debit 4410 (Input VAT / Kiruvchi QQS): vatAmount (if any)
      // Credit 6010 / 5010 (Accounts Payable / Cash): totalAmount
      const inventoryAcc = await tx.account.findFirst({
        where: { tenantId, code: '2910' },
      });
      const cogsAcc = await tx.account.findFirst({
        where: { tenantId, code: '9110' },
      });
      const vatAcc = await tx.account.findFirst({
        where: { tenantId, code: '4410' },
      });
      const cashLedgerAccountCode = paidCashAccount
        ? ledgerAccountCodeForCashAccount(paidCashAccount)
        : null;
      const creditAcc = expense.isPaid
        ? await tx.account.findFirst({
            where: {
              tenantId,
              code: cashLedgerAccountCode ?? '__INVALID_CASH_ACCOUNT__',
            },
          })
        : await tx.account.findFirst({ where: { tenantId, code: '6010' } });

      if (creditAcc) {
        const journalLines: JournalLineDto[] = [];
        const netStock = Math.max(
          0,
          capitalizedTotal -
            totalCogsAdjustment -
            Number(expense.vatAmount || 0) * capitalizationRate,
        );

        if (inventoryAcc && netStock > 0) {
          journalLines.push({
            debitAccountId: inventoryAcc.id,
            creditAccountId: creditAcc.id,
            amount: netStock,
            description:
              'Ombordagi tovarlar tannarxiga xarajat kapitalizatsiyasi',
          });
        }

        if (cogsAcc && totalCogsAdjustment > 0) {
          journalLines.push({
            debitAccountId: cogsAcc.id,
            creditAccountId: creditAcc.id,
            amount: totalCogsAdjustment,
            description:
              'Sotilgan tovarlar tannarxiga (COGS) retroaktiv xarajat taqsimoti',
          });
        }

        if (vatAcc && Number(expense.vatAmount) > 0) {
          journalLines.push({
            debitAccountId: vatAcc.id,
            creditAccountId: creditAcc.id,
            amount: Number(expense.vatAmount) * capitalizationRate,
            description: 'Qo‘shimcha xizmat bo‘yicha kiruvchi QQS',
          });
        }

        if (journalLines.length > 0) {
          await this.journalService.createJournalEntry(
            tenantId,
            {
              entryDate: expense.docDate,
              description: `Qo‘shimcha xarajat: ${expense.docNumber} — ${expense.counterparty.name}`,
              sourceDocType: 'AdditionalExpense',
              sourceDocId: expense.id,
              lines: journalLines,
            },
            tx,
          );
        }
      }

      // 4. Update status to POSTED
      const updatedExpense = await tx.additionalExpense.update({
        where: { tenantId, id },
        data: {
          status: PurchaseDocStatus.POSTED,
          postedById: userId,
          postedAt: new Date(),
        },
        include: {
          counterparty: true,
          receipt: true,
          items: { include: { product: true } },
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'AdditionalExpense',
          entityId: id,
          action: 'UPDATE',
          oldValue: { status: PurchaseDocStatus.DRAFT },
          newValue: { status: PurchaseDocStatus.POSTED },
        },
      });

      return updatedExpense;
    });
  }

  // ─── SAFE CANCELLATION & ROLLBACK GUARDRAIL (TICKET 4) ────────

  async cancelExpense(tenantId: string, userId: string, id: string) {
    const expense = await this.prisma.additionalExpense.findFirst({
      where: { id, tenantId },
      include: {
        items: true,
        counterparty: true,
      },
    });

    if (!expense) {
      throw new NotFoundException('Qo‘shimcha xarajat hujjati topilmadi');
    }

    if (expense.status !== PurchaseDocStatus.POSTED) {
      throw new BadRequestException(
        'Faqat tasdiqlangan holatidagi xarajatlarni bekor qilish mumkin',
      );
    }

    // Rollback Guardrail: Check active linked cash payment transactions
    const linkedTx = await this.prisma.financeTransaction.findFirst({
      where: {
        tenantId,
        sourceDocType: 'AdditionalExpense',
        sourceDocId: id,
        isDeleted: false,
      },
    });

    if (linkedTx) {
      throw new BadRequestException(
        "Ushbu xarajat bo'yicha kassa to'lovi mavjud. Avval Moliya bo'limidan kassa to'lovini bekor qiling.",
      );
    }

    const totalAmount = Number(expense.amount);

    return this.prisma.$transaction(async (tx) => {
      // D4: nothing dated in a closed accounting period may change.
      await assertPeriodOpen(tx, tenantId, expense.docDate, 'cancel');
      // 1. Revert ProductBatch landed cost & Retroactive COGS
      for (const item of expense.items) {
        const allocatedAmount = Number(item.allocatedAmount);
        const itemQty =
          Number(item.soldQuantity) + Number(item.remainingQuantity) || 1;
        const allocatedPerUnit = allocatedAmount / itemQty;

        const batch = await tx.productBatch.findFirst({
          where: {
            tenantId,
            receiptId: expense.receiptId,
            productId: item.productId,
          },
          include: {
            consumptions: {
              include: { salesInvoiceItem: true },
            },
          },
        });

        if (batch) {
          const currentBatchLandedCost = Number(batch.landedCost);
          const restoredBatchLandedCost = Math.max(
            Number(batch.purchasePrice),
            currentBatchLandedCost - allocatedPerUnit,
          );

          await tx.productBatch.update({
            where: { tenantId, id: batch.id },
            data: { landedCost: restoredBatchLandedCost },
          });

          // Sync catalog cost price
          await tx.product.update({
            where: { tenantId, id: item.productId },
            data: {
              costPrice: restoredBatchLandedCost,
              costPriceCurrency: 'UZS',
              costPriceExchangeRate: 1,
            },
          });

          // Revert retroactive COGS on downstream sales invoices
          for (const consumption of batch.consumptions) {
            const consumedQty = Number(consumption.quantity);
            const lineCogsDelta = consumedQty * allocatedPerUnit;

            if (consumption.salesInvoiceItem) {
              const currentUnitCogs = Number(
                consumption.salesInvoiceItem.unitCogs || 0,
              );
              const currentLineCogs = Number(
                consumption.salesInvoiceItem.lineCogs || 0,
              );
              const restoredUnitCogs = Math.max(
                0,
                currentUnitCogs - allocatedPerUnit,
              );
              const restoredLineCogs = Math.max(
                0,
                currentLineCogs - lineCogsDelta,
              );
              const invoice = await tx.salesInvoice.findUnique({
                where: { tenantId, id: consumption.salesInvoiceItem.invoiceId },
              });
              if (!invoice) {
                throw new BadRequestException(
                  'Sotuv hujjati topilmadi (tannarxni qayta hisoblash)',
                );
              }
              const restoredGrossProfit = salesProfitInUzs(
                invoice,
                Number(consumption.salesInvoiceItem.totalPrice) -
                  Number(consumption.salesInvoiceItem.vatAmount || 0),
                restoredLineCogs,
              );

              await tx.salesInvoiceItem.update({
                where: {
                  invoice: { tenantId },
                  id: consumption.salesInvoiceItem.id,
                },
                data: {
                  unitCogs: restoredUnitCogs,
                  lineCogs: restoredLineCogs,
                  lineGrossProfit: restoredGrossProfit,
                },
              });

              // Recalculate parent invoice
              const allInvoiceItems = await tx.salesInvoiceItem.findMany({
                where: {
                  invoice: { tenantId },
                  invoiceId: consumption.salesInvoiceItem.invoiceId,
                },
              });
              const invoiceTotalCogs = allInvoiceItems.reduce((s, it) => {
                if (it.id === consumption.salesInvoiceItemId) {
                  return s + restoredLineCogs;
                }
                return s + Number(it.lineCogs || 0);
              }, 0);

              const newInvoiceGrossProfit = salesProfitInUzs(
                invoice,
                Number(invoice.totalAmount) - Number(invoice.vatAmount || 0),
                invoiceTotalCogs,
              );

              await tx.salesInvoice.update({
                where: { tenantId, id: consumption.salesInvoiceItem.invoiceId },
                data: {
                  totalCogs: invoiceTotalCogs,
                  grossProfit: newInvoiceGrossProfit,
                },
              });
            }
          }
        }
      }

      // Revert PurchaseReceipt additionalExpensesTotal
      await tx.purchaseReceipt.update({
        where: { tenantId, id: expense.receiptId },
        data: {
          additionalExpensesTotal: { decrement: totalAmount },
        },
      });

      // 2. Revert Supplier Debt if unpaid
      if (!expense.isPaid) {
        await this.settlementService.recordMovement(tx, {
          tenantId,
          counterpartyId: expense.counterpartyId,
          currency: expense.currency,
          side: CounterpartySettlementSide.SUPPLIER,
          amount: -totalAmount,
          entryType: 'ADDITIONAL_EXPENSE_CANCELLED',
          effectiveAt: expense.docDate,
          sourceDocType: 'AdditionalExpense',
          sourceDocId: expense.id,
          idempotencyKey: `AdditionalExpense:${expense.id}:CANCELLED`,
        });
      }

      // 3. Delete or void linked journal entries
      await this.journalService.deleteEntriesForSource(
        tx,
        tenantId,
        'AdditionalExpense',
        id,
        'cancel',
      );

      // 4. Update status to CANCELLED
      const cancelledExpense = await tx.additionalExpense.update({
        where: { tenantId, id },
        data: { status: PurchaseDocStatus.CANCELLED },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'AdditionalExpense',
          entityId: id,
          action: 'UPDATE',
          oldValue: { status: PurchaseDocStatus.POSTED },
          newValue: { status: PurchaseDocStatus.CANCELLED },
        },
      });

      return cancelledExpense;
    });
  }
}

/**
 * Gross profit of a sales invoice (or line) after its COGS is recalibrated
 * (ADR 0008): net revenue excluding VAT, converted to UZS at the invoice's
 * rate, minus COGS in UZS (ADR 0011), the same rule as posting the invoice.
 */
function salesProfitInUzs(
  invoice: { currency: string; exchangeRate: Prisma.Decimal | number },
  netRevenue: number,
  cogsInUzs: number,
): number {
  try {
    return grossProfitInUzs(
      netRevenue,
      invoice.currency,
      Number(invoice.exchangeRate),
      cogsInUzs,
    );
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error
        ? error.message
        : 'Yalpi foydani hisoblab bo‘lmadi',
    );
  }
}
