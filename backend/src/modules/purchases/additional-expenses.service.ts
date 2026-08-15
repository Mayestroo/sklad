import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
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
} from '@prisma/client';

@Injectable()
export class AdditionalExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── DOCUMENT NUMBER GENERATOR ──────────────────────────────

  private async generateDocNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `EXP-${year}-`;
    const count = await this.prisma.additionalExpense.count({
      where: {
        tenantId,
        docNumber: { startsWith: prefix },
      },
    });
    const nextNum = (count + 1).toString().padStart(4, '0');
    return `${prefix}${nextNum}`;
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

    // Calculate basis depending on allocation method
    let basisSum = 0;
    if (allocationMethod === ExpenseAllocationMethod.BY_AMOUNT) {
      basisSum = targetItems.reduce(
        (sum, i) => sum + Number(i.totalPrice || 0),
        0,
      );
    } else if (allocationMethod === ExpenseAllocationMethod.BY_QUANTITY) {
      basisSum = targetItems.reduce(
        (sum, i) => sum + Number(i.quantity || 0),
        0,
      );
    } else if (allocationMethod === ExpenseAllocationMethod.BY_WEIGHT) {
      basisSum = targetItems.reduce((sum, i) => {
        const unitWeight =
          Number(i.weight) > 0
            ? Number(i.weight)
            : Number(i.product?.weight) || 1;
        return sum + Number(i.quantity || 0) * unitWeight;
      }, 0);
    }

    if (basisSum <= 0) {
      basisSum = targetItems.length;
    }

    // Allocate across items with Remainder Rule
    let runningAllocated = 0;
    let maxLineItemIndex = 0;
    let maxLineItemValue = -1;

    const previewItems = targetItems.map((item, index) => {
      const qty = Number(item.quantity) || 1;
      const lineTotal = Number(item.totalPrice) || 0;
      const unitWeight =
        Number(item.weight) > 0
          ? Number(item.weight)
          : Number(item.product?.weight) || 1;

      if (lineTotal > maxLineItemValue) {
        maxLineItemValue = lineTotal;
        maxLineItemIndex = index;
      }

      let ratio = 0;
      if (allocationMethod === ExpenseAllocationMethod.BY_AMOUNT) {
        ratio = lineTotal / basisSum;
      } else if (allocationMethod === ExpenseAllocationMethod.BY_QUANTITY) {
        ratio = qty / basisSum;
      } else if (allocationMethod === ExpenseAllocationMethod.BY_WEIGHT) {
        ratio = (qty * unitWeight) / basisSum;
      } else {
        ratio = 1 / targetItems.length;
      }

      const allocatedRaw = Math.round(totalAmount * ratio * 100) / 100;
      runningAllocated += allocatedRaw;

      // Find batch for remaining vs sold quantities
      const batch = receipt.batches.find((b) => b.productId === item.productId);
      const remainingQty = batch ? Number(batch.remainingQty) : qty;
      const soldQty = Math.max(0, qty - remainingQty);

      const initialLandedCost =
        Number(item.landedCost) > 0
          ? Number(item.landedCost)
          : Number(item.unitPrice);

      return {
        receiptItemId: item.id,
        productId: item.productId,
        productName: item.product?.name,
        sku: item.product?.sku || '',
        unitOfMeasure: item.product?.unitOfMeasure || 'piece',
        quantity: qty,
        unitPrice: Number(item.unitPrice),
        totalPrice: lineTotal,
        weight: unitWeight,
        initialLandedCost,
        allocatedAmount: allocatedRaw,
        allocatedPerUnit: 0,
        newLandedCost: 0,
        costIncreasePercent: 0,
        soldQuantity: soldQty,
        remainingQuantity: remainingQty,
        cogsAdjustment: 0,
        stockAdjustment: 0,
      };
    });

    // Apply Allocation Remainder Rule: add remainder to highest-value item
    const remainder = Math.round((totalAmount - runningAllocated) * 100) / 100;
    if (remainder !== 0 && previewItems[maxLineItemIndex]) {
      previewItems[maxLineItemIndex].allocatedAmount =
        Math.round(
          (previewItems[maxLineItemIndex].allocatedAmount + remainder) * 100,
        ) / 100;
    }

    // Finalize unit costs and sold/stock splits
    let finalAllocatedTotal = 0;
    for (const p of previewItems) {
      finalAllocatedTotal += p.allocatedAmount;
      p.allocatedPerUnit = p.quantity > 0 ? p.allocatedAmount / p.quantity : 0;
      p.newLandedCost = p.initialLandedCost + p.allocatedPerUnit;
      p.costIncreasePercent =
        p.initialLandedCost > 0
          ? (p.allocatedPerUnit / p.initialLandedCost) * 100
          : 0;

      const soldFraction = p.quantity > 0 ? p.soldQuantity / p.quantity : 0;
      p.cogsAdjustment =
        Math.round(p.allocatedAmount * soldFraction * 100) / 100;
      p.stockAdjustment =
        Math.round((p.allocatedAmount - p.cogsAdjustment) * 100) / 100;
    }

    return {
      expenseAmount: totalAmount,
      allocationMethod,
      allocatedTotal: finalAllocatedTotal,
      remainder,
      items: previewItems,
    };
  }

  // ─── DRAFT CRUD ─────────────────────────────────────────────

  async createDraft(
    tenantId: string,
    userId: string,
    dto: CreateAdditionalExpenseDto,
  ) {
    const docNumber = await this.generateDocNumber(tenantId);
    const allocation = await this.calculateAllocationPreview(tenantId, {
      receiptId: dto.receiptId,
      amount: dto.amount,
      allocationMethod: dto.allocationMethod,
      selectedItemIds: dto.selectedItemIds,
    });

    const docDate = dto.docDate ? new Date(dto.docDate) : new Date();
    const exchangeRate = dto.exchangeRate || 1;
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
          currency: dto.currency || 'UZS',
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

    const receiptId = dto.receiptId || existing.receiptId;
    const amount = dto.amount !== undefined ? dto.amount : Number(existing.amount);
    const allocationMethod =
      dto.allocationMethod || existing.allocationMethod;

    const allocation = await this.calculateAllocationPreview(tenantId, {
      receiptId,
      amount,
      allocationMethod,
      selectedItemIds: dto.selectedItemIds,
    });

    const exchangeRate =
      dto.exchangeRate !== undefined
        ? dto.exchangeRate
        : Number(existing.exchangeRate);
    const vatRate =
      dto.vatRate !== undefined ? dto.vatRate : Number(existing.vatRate);
    const vatAmount =
      vatRate > 0 ? (amount * vatRate) / (100 + vatRate) : 0;

    return this.prisma.$transaction(async (tx) => {
      await tx.additionalExpenseItem.deleteMany({
        where: { expenseId: id },
      });

      const updated = await tx.additionalExpense.update({
        where: { id },
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

    if (existing.status !== PurchaseDocStatus.DRAFT) {
      throw new BadRequestException(
        'Faqat qoralama holatidagi xarajatlarni o‘chirish mumkin',
      );
    }

    await this.prisma.additionalExpense.delete({ where: { id } });

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
      select: { expenseType: true, amount: true },
    });

    const totalTransport = allPosted
      .filter((e) => e.expenseType === 'TRANSPORT')
      .reduce((s, e) => s + Number(e.amount), 0);
    const totalCustoms = allPosted
      .filter((e) => e.expenseType === 'CUSTOMS')
      .reduce((s, e) => s + Number(e.amount), 0);
    const totalBroker = allPosted
      .filter((e) => e.expenseType === 'BROKER')
      .reduce((s, e) => s + Number(e.amount), 0);
    const totalAll = allPosted.reduce((s, e) => s + Number(e.amount), 0);

    return {
      items,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
      stats: {
        totalTransport,
        totalCustoms,
        totalBroker,
        totalAll,
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
    let retroactiveSalesImpact: any[] = [];
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

      const impactMap = new Map<string, any>();
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

          if (!impactMap.has(key)) {
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
            const existing = impactMap.get(key);
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

    const totalAmount = Number(expense.amount);

    return this.prisma.$transaction(async (tx) => {
      let totalStockAdjustment = 0;
      let totalCogsAdjustment = 0;

      // 1. Update ProductBatch landed cost & Retroactive COGS
      for (const item of expense.items) {
        const allocatedAmount = Number(item.allocatedAmount);
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
            where: { id: batch.id },
            data: { landedCost: newBatchLandedCost },
          });

          // Sync Product catalog costPrice (ADR 0007)
          await tx.product.update({
            where: { id: item.productId },
            data: { costPrice: newBatchLandedCost },
          });

          // Retroactive COGS Recalibration for all downstream consumptions (ADR 0008)
          for (const consumption of batch.consumptions) {
            const consumedQty = Number(consumption.quantity);
            const lineCogsDelta = consumedQty * allocatedPerUnit;
            totalCogsAdjustment += lineCogsDelta;

            if (consumption.salesInvoiceItem) {
              const currentUnitCogs = Number(
                consumption.salesInvoiceItem.unitCogs || 0,
              );
              const currentLineCogs = Number(
                consumption.salesInvoiceItem.lineCogs || 0,
              );
              const newUnitCogs = currentUnitCogs + allocatedPerUnit;
              const newLineCogs = currentLineCogs + lineCogsDelta;
              const newGrossProfit =
                Number(consumption.salesInvoiceItem.totalPrice) - newLineCogs;

              await tx.salesInvoiceItem.update({
                where: { id: consumption.salesInvoiceItemId },
                data: {
                  unitCogs: newUnitCogs,
                  lineCogs: newLineCogs,
                  lineGrossProfit: newGrossProfit,
                },
              });

              // Recalculate parent sales invoice total cogs & gross profit
              const allInvoiceItems = await tx.salesInvoiceItem.findMany({
                where: { invoiceId: consumption.salesInvoiceItem.invoiceId },
              });
              const invoiceTotalCogs = allInvoiceItems.reduce((s, it) => {
                if (it.id === consumption.salesInvoiceItemId) {
                  return s + newLineCogs;
                }
                return s + Number(it.lineCogs || 0);
              }, 0);

              const invoice = await tx.salesInvoice.findUnique({
                where: { id: consumption.salesInvoiceItem.invoiceId },
              });
              const newInvoiceGrossProfit =
                Number(invoice?.totalAmount || 0) - invoiceTotalCogs;

              await tx.salesInvoice.update({
                where: { id: consumption.salesInvoiceItem.invoiceId },
                data: {
                  totalCogs: invoiceTotalCogs,
                  grossProfit: newInvoiceGrossProfit,
                },
              });
            }
          }
        }

        // Update item fields
        const stockPortion =
          Math.max(
            0,
            allocatedAmount -
              (Number(item.soldQuantity) / itemQty) * allocatedAmount,
          );
        totalStockAdjustment += stockPortion;

        await tx.additionalExpenseItem.update({
          where: { id: item.id },
          data: {
            newLandedCost: Number(item.initialLandedCost) + allocatedPerUnit,
            cogsAdjustment:
              (Number(item.soldQuantity) / itemQty) * allocatedAmount,
          },
        });
      }

      // Update PurchaseReceipt total additional expenses
      await tx.purchaseReceipt.update({
        where: { id: expense.receiptId },
        data: {
          additionalExpensesTotal: { increment: totalAmount },
        },
      });

      // 2. Financial Settlements
      if (expense.isPaid && expense.cashAccountId) {
        const cashAcc = await tx.cashAccount.findFirst({
          where: { id: expense.cashAccountId, tenantId, isActive: true },
        });

        if (!cashAcc) {
          throw new NotFoundException('Kassa hisobi topilmadi');
        }

        if (Number(cashAcc.balance) < totalAmount) {
          throw new BadRequestException(
            `Kassada mablag' yetarli emas. Mavjud: ${cashAcc.balance} ${cashAcc.currency}, Xarajat: ${totalAmount} ${expense.currency}`,
          );
        }

        // Decrement cash balance
        await tx.cashAccount.update({
          where: { id: expense.cashAccountId },
          data: { balance: { decrement: totalAmount } },
        });

        // Create FinanceTransaction EXPENSE
        const txCount = await tx.financeTransaction.count({
          where: { tenantId },
        });
        const txNumber = `FT-${new Date().getFullYear()}-${(txCount + 1).toString().padStart(5, '0')}`;

        await tx.financeTransaction.create({
          data: {
            tenantId,
            docNumber: txNumber,
            direction: TransactionDirection.EXPENSE,
            amount: totalAmount,
            currency: cashAcc.currency,
            transactionDate: expense.docDate,
            comment:
              expense.comment ||
              `Qo‘shimcha xarajat to‘lovi: ${expense.docNumber} (${expense.counterparty.name})`,
            accountId: expense.cashAccountId,
            counterpartyId: expense.counterpartyId,
            sourceDocType: 'AdditionalExpense',
            sourceDocId: expense.id,
            createdById: userId,
          },
        });
      } else {
        // Increment supplier debt balance
        await tx.counterparty.update({
          where: { id: expense.counterpartyId },
          data: { debtBalance: { increment: totalAmount } },
        });
      }

      // 3. Automated BHMS / NAS Double-Entry Journal Postings (ADR 0006)
      // Debit 2910 (Inventory / Ombor tovarlari): totalStockAdjustment
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
      const creditAcc = expense.isPaid
        ? await tx.account.findFirst({ where: { tenantId, code: '5010' } })
        : await tx.account.findFirst({ where: { tenantId, code: '6010' } });

      if (creditAcc) {
        const jeCount = await tx.journalEntry.count({ where: { tenantId } });
        const jeNumber = `JE-${new Date().getFullYear()}-${(jeCount + 1).toString().padStart(5, '0')}`;

        const journalLines: any[] = [];
        const netStock = Math.max(
          0,
          totalAmount - totalCogsAdjustment - Number(expense.vatAmount || 0),
        );

        if (inventoryAcc && netStock > 0) {
          journalLines.push({
            debitAccountId: inventoryAcc.id,
            creditAccountId: creditAcc.id,
            amount: netStock,
            description: 'Ombordagi tovarlar tannarxiga xarajat kapitalizatsiyasi',
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
            amount: Number(expense.vatAmount),
            description: 'Qo‘shimcha xizmat bo‘yicha kiruvchi QQS',
          });
        }

        if (journalLines.length > 0) {
          await tx.journalEntry.create({
            data: {
              tenantId,
              entryNumber: jeNumber,
              entryDate: expense.docDate,
              description: `Qo‘shimcha xarajat: ${expense.docNumber} — ${expense.counterparty.name}`,
              sourceDocType: 'AdditionalExpense',
              sourceDocId: expense.id,
              lines: {
                create: journalLines,
              },
            },
          });
        }
      }

      // 4. Update status to POSTED
      const updatedExpense = await tx.additionalExpense.update({
        where: { id },
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
            where: { id: batch.id },
            data: { landedCost: restoredBatchLandedCost },
          });

          // Sync catalog cost price
          await tx.product.update({
            where: { id: item.productId },
            data: { costPrice: restoredBatchLandedCost },
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
              const restoredGrossProfit =
                Number(consumption.salesInvoiceItem.totalPrice) -
                restoredLineCogs;

              await tx.salesInvoiceItem.update({
                where: { id: consumption.salesInvoiceItemId },
                data: {
                  unitCogs: restoredUnitCogs,
                  lineCogs: restoredLineCogs,
                  lineGrossProfit: restoredGrossProfit,
                },
              });

              // Recalculate parent invoice
              const allInvoiceItems = await tx.salesInvoiceItem.findMany({
                where: { invoiceId: consumption.salesInvoiceItem.invoiceId },
              });
              const invoiceTotalCogs = allInvoiceItems.reduce((s, it) => {
                if (it.id === consumption.salesInvoiceItemId) {
                  return s + restoredLineCogs;
                }
                return s + Number(it.lineCogs || 0);
              }, 0);

              const invoice = await tx.salesInvoice.findUnique({
                where: { id: consumption.salesInvoiceItem.invoiceId },
              });
              const newInvoiceGrossProfit =
                Number(invoice?.totalAmount || 0) - invoiceTotalCogs;

              await tx.salesInvoice.update({
                where: { id: consumption.salesInvoiceItem.invoiceId },
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
        where: { id: expense.receiptId },
        data: {
          additionalExpensesTotal: { decrement: totalAmount },
        },
      });

      // 2. Revert Supplier Debt if unpaid
      if (!expense.isPaid) {
        await tx.counterparty.update({
          where: { id: expense.counterpartyId },
          data: { debtBalance: { decrement: totalAmount } },
        });
      }

      // 3. Delete or void linked journal entries
      await tx.journalEntry.deleteMany({
        where: {
          tenantId,
          sourceDocType: 'AdditionalExpense',
          sourceDocId: id,
        },
      });

      // 4. Update status to CANCELLED
      const cancelledExpense = await tx.additionalExpense.update({
        where: { id },
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
