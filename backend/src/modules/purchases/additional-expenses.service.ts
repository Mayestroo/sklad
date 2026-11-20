import { catalogCostFromUzs } from '../inventory/products/catalog-cost';
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
  SettlementAllocationTarget,
  SalesReturnDocStatus,
} from '@prisma/client';

import { nextDocumentNumber } from '../../common/sequences/document-sequence';
import { grossProfitInUzs } from '../sales/sales-calculations';
import {
  allocationSnapshotDifferences,
  convertAndAllocate,
  type ConvertedAllocation,
} from './expense-allocation.engine';
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
import { JournalService } from '../accounting/journal/journal.service';
import type { JournalLineDto } from '../accounting/dto';
import { assertTenantOwned } from '../../common/prisma/assert-tenant-owned';
import { formatMoney } from '../../../../shared/format/money';
import { assertPeriodOpen } from '../../common/accounting-period/period-lock';
import {
  assertNoUzsLandedCost,
  usdReceiptLinesWithUzsLandedCost,
} from './usd-receipt-landed-cost';

/** The user fields an expense response may carry: never the password hash. */
const USER_SUMMARY = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

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
  ): Promise<ConvertedAllocation> {
    return this.allocate(this.prisma, tenantId, {
      receiptId: dto.receiptId,
      amount: dto.amount,
      currency: dto.currency,
      exchangeRate: dto.exchangeRate,
      allocationMethod:
        dto.allocationMethod || ExpenseAllocationMethod.BY_AMOUNT,
      selectedItemIds: dto.selectedItemIds,
      rateDate: dto.docDate ? new Date(dto.docDate) : new Date(),
    });
  }

  /**
   * Loads the receipt and runs convertAndAllocate(): the one path the
   * preview, draft save and posting take, so they cannot disagree.
   */
  private async allocate(
    db: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    args: {
      receiptId: string;
      amount: Prisma.Decimal | number;
      currency: string;
      exchangeRate: Prisma.Decimal | number | null | undefined;
      allocationMethod: ExpenseAllocationMethod;
      selectedItemIds?: string[];
      rateDate: Date;
    },
  ): Promise<ConvertedAllocation> {
    const receipt = await db.purchaseReceipt.findFirst({
      where: { id: args.receiptId, tenantId },
      include: {
        items: { include: { product: true } },
        batches: true,
      },
    });
    if (!receipt) {
      throw new NotFoundException('Xarid hujjati topilmadi');
    }

    let targetItems = receipt.items;
    if (args.selectedItemIds && args.selectedItemIds.length > 0) {
      const selectedSet = new Set(args.selectedItemIds);
      targetItems = receipt.items.filter((i) => selectedSet.has(i.id));
      if (targetItems.length !== selectedSet.size) {
        throw new BadRequestException(
          'Tanlangan tovar ushbu xaridga tegishli emas / Выбранный товар не относится к этому приходу',
        );
      }
    }

    return convertAndAllocate({
      items: targetItems,
      amount: args.amount,
      allocationMethod: args.allocationMethod,
      expense: { currency: args.currency, exchangeRate: args.exchangeRate },
      receipt,
      rateDate: args.rateDate,
      batches: receipt.batches,
    });
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

    const docDate = dto.docDate ? new Date(dto.docDate) : new Date();
    const allocation = await this.allocate(this.prisma, tenantId, {
      receiptId: dto.receiptId,
      amount: dto.amount,
      currency: dto.currency,
      exchangeRate,
      allocationMethod:
        dto.allocationMethod || ExpenseAllocationMethod.BY_AMOUNT,
      selectedItemIds: dto.selectedItemIds,
      rateDate: docDate,
    });
    const docNumber = await this.generateDocNumber(tenantId);

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
            create: allocationRows(allocation),
          },
        },
        include: {
          counterparty: true,
          receipt: { include: { counterparty: true, warehouse: true } },
          cashAccount: true,
          createdBy: { select: USER_SUMMARY },
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

    const docDate = dto.docDate ? new Date(dto.docDate) : existing.docDate;
    // No new selection: keep the draft's own lines (it used to fall back to
    // every line of the receipt). A different receipt starts from all lines.
    const selectedItemIds =
      dto.selectedItemIds ??
      (receiptId === existing.receiptId
        ? existing.items.map((i) => i.receiptItemId)
        : undefined);
    const allocation = await this.allocate(this.prisma, tenantId, {
      receiptId,
      amount,
      currency: targetCurrency,
      exchangeRate,
      allocationMethod,
      selectedItemIds,
      rateDate: docDate,
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
          docDate,
          expenseType: dto.expenseType || existing.expenseType,
          counterpartyId: dto.counterpartyId || existing.counterpartyId,
          receiptId,
          amount,
          currency: targetCurrency,
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
            create: allocationRows(allocation),
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
          createdBy: { select: USER_SUMMARY },
          postedBy: { select: USER_SUMMARY },
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
        createdBy: { select: USER_SUMMARY },
        postedBy: { select: USER_SUMMARY },
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
      // Sales costs are in UZS: the stored per-unit UZS delta posting
      // applied, rounded per sale line the same way (no fresh conversion).
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
        // A row without a stored conversion has no known impact: skip it
        // rather than recompute it at today's rate.
        if (itemExpense?.baseUnitDelta == null) continue;
        const unitExpense = Number(itemExpense.baseUnitDelta);

        for (const c of batch.consumptions) {
          const invItem = c.salesInvoiceItem;
          if (!invItem) continue;

          const key = invItem.invoiceId;
          const consumedQty = Number(c.quantity);
          const cogsDelta = new Prisma.Decimal(itemExpense.baseUnitDelta)
            .mul(c.quantity)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            .toNumber();

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

  /** Writes a batch landed cost (UZS) onto the product card in the card's currency (ADR 0007). */
  private async syncCatalogCost(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    landedCostUzs: number,
  ) {
    const card = await tx.product.findFirst({
      where: { tenantId, id: productId },
      select: { costPriceCurrency: true, costPriceExchangeRate: true },
    });
    await tx.product.update({
      where: { tenantId, id: productId },
      data: catalogCostFromUzs(landedCostUzs, card),
    });
  }

  /**
   * Adds `sign × unitDelta` (UZS per unit) to the receipt batch's landed
   * cost, its product card and the COGS of every sale from it (ADR 0008).
   * Posting passes +1 and cancelling -1 with the same stored delta, and every
   * figure is rounded the same way, so the two cancel out exactly. Returns
   * the change in sales COGS (UZS).
   *
   * With `revalueConsumptions`, the sales' batch consumptions get the same
   * per-unit delta: a sales return re-enters stock at the consumption cost
   * (ADR 0012), so it must be the cost the sale is now charged.
   */
  private async revalueBatch(
    tx: Prisma.TransactionClient,
    tenantId: string,
    receiptId: string,
    productId: string,
    unitDelta: Prisma.Decimal,
    sign: 1 | -1,
    revalueConsumptions: boolean,
  ): Promise<Prisma.Decimal> {
    const toMoney = (d: Prisma.Decimal) =>
      d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const delta = unitDelta.mul(sign);
    let cogsChange = new Prisma.Decimal(0);

    const batch = await tx.productBatch.findFirst({
      where: { tenantId, receiptId, productId },
      include: { consumptions: { include: { salesInvoiceItem: true } } },
    });
    if (!batch) return cogsChange;

    // A batch without a landed cost starts from its purchase price (posting only).
    const current =
      sign > 0 && new Prisma.Decimal(batch.landedCost).lte(0)
        ? new Prisma.Decimal(batch.purchasePrice)
        : new Prisma.Decimal(batch.landedCost);
    const newLandedCost = current.add(delta);
    await tx.productBatch.update({
      where: { tenantId, id: batch.id },
      data: { landedCost: newLandedCost },
    });
    if (revalueConsumptions) {
      // Only sales consumptions, the same rows whose COGS changes below. A
      // stock transfer's consumptions must keep the cost its shipment posted
      // (receiving rebuilds the layers from them so 2920 nets to zero), and
      // purchase returns / inventory documents are not revalued.
      await tx.batchConsumption.updateMany({
        where: {
          tenantId,
          batchId: batch.id,
          salesInvoiceItemId: { not: null },
        },
        data: { unitCost: { increment: delta } },
      });
    }
    // Sync the product card cost (ADR 0007), keeping the card's currency.
    await this.syncCatalogCost(
      tx,
      tenantId,
      productId,
      newLandedCost.toNumber(),
    );

    for (const consumption of batch.consumptions) {
      // Only sales consumptions are COGS; goods returned to the supplier
      // (purchase-return consumptions) are not.
      const saleLine = consumption.salesInvoiceItem;
      if (!saleLine) continue;
      const lineCogsDelta = toMoney(delta.mul(consumption.quantity));
      cogsChange = cogsChange.add(lineCogsDelta);

      const newUnitCogs = new Prisma.Decimal(saleLine.unitCogs ?? 0).add(delta);
      const newLineCogs = new Prisma.Decimal(saleLine.lineCogs ?? 0).add(
        lineCogsDelta,
      );
      const invoice = await tx.salesInvoice.findUnique({
        where: { tenantId, id: saleLine.invoiceId },
      });
      if (!invoice) {
        throw new BadRequestException(
          'Sotuv hujjati topilmadi (tannarxni qayta hisoblash)',
        );
      }
      await tx.salesInvoiceItem.update({
        where: { invoice: { tenantId }, id: saleLine.id },
        data: {
          unitCogs: newUnitCogs,
          lineCogs: newLineCogs,
          lineGrossProfit: salesProfitInUzs(
            invoice,
            Number(saleLine.totalPrice) - Number(saleLine.vatAmount || 0),
            newLineCogs.toNumber(),
          ),
        },
      });

      // Recalculate the invoice's total COGS and gross profit.
      const invoiceItems = await tx.salesInvoiceItem.findMany({
        where: { invoice: { tenantId }, invoiceId: saleLine.invoiceId },
      });
      const invoiceTotalCogs = sumDecimal(
        invoiceItems.map((it) =>
          it.id === saleLine.id ? newLineCogs : (it.lineCogs ?? 0),
        ),
      );
      await tx.salesInvoice.update({
        where: { tenantId, id: saleLine.invoiceId },
        data: {
          totalCogs: invoiceTotalCogs,
          grossProfit: salesProfitInUzs(
            invoice,
            Number(invoice.totalAmount) - Number(invoice.vatAmount || 0),
            invoiceTotalCogs.toNumber(),
          ),
        },
      });
    }
    return cogsChange;
  }

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

    return this.prisma.$transaction(async (tx) => {
      // Lock the draft so a concurrent save cannot replace its lines while
      // they are being posted.
      const lockedStatus = await lockDocumentStatus(
        tx,
        'additionalExpense',
        id,
        tenantId,
      );
      if (lockedStatus !== PurchaseDocStatus.DRAFT) {
        throw new BadRequestException(
          'Faqat qoralama holatidagi xarajatlarni tasdiqlash mumkin',
        );
      }
      const storedItems = await tx.additionalExpenseItem.findMany({
        where: { expense: { tenantId }, expenseId: id },
      });

      // A USD receipt line still holding a UZS landed cost (old posting bug)
      // is repaired first: never add a USD amount on top of a UZS figure.
      assertNoUzsLandedCost(
        expense.receipt,
        await usdReceiptLinesWithUzsLandedCost(
          tx,
          tenantId,
          expense.receipt,
          storedItems.map((i) => i.receiptItemId),
        ),
      );

      // Posting recomputes with the one conversion function and applies the
      // result only if it is what the user saw when the draft was saved: a
      // changed receipt, rate or line is refused, never silently applied.
      const allocation = await this.allocate(tx, tenantId, {
        receiptId: expense.receiptId,
        amount: expense.amount,
        currency: expense.currency,
        exchangeRate: expense.exchangeRate,
        allocationMethod: expense.allocationMethod,
        selectedItemIds: storedItems.map((i) => i.receiptItemId),
        rateDate: expense.docDate,
      });
      const differences = allocationSnapshotDifferences(
        storedItems,
        allocation,
      );
      if (differences.length > 0) {
        throw new BadRequestException(
          `Qoralama saqlangandan keyin xarid yoki kurs o'zgargan — qoralamani qayta saqlang va taqsimotni tekshiring / После сохранения черновика изменились приход или курс — сохраните черновик заново и проверьте распределение (${differences.slice(0, 5).join('; ')})`,
        );
      }

      // 1. Apply the stored per-unit amounts: UZS to the batch, its product
      // card and the COGS of sales from it; receipt currency to the receipt
      // line. Cancelling subtracts the same stored values.
      let totalCogsAdjustment = new Prisma.Decimal(0);
      for (const item of storedItems) {
        const line = allocation.items.find(
          (l) => l.receiptItemId === item.receiptItemId,
        )!;
        const cogsAdjustment = await this.revalueBatch(
          tx,
          tenantId,
          expense.receiptId,
          item.productId,
          new Prisma.Decimal(item.baseUnitDelta!),
          1,
          true,
        );
        totalCogsAdjustment = totalCogsAdjustment.add(cogsAdjustment);

        await tx.purchaseReceiptItem.update({
          where: { receipt: { tenantId }, id: item.receiptItemId },
          data: { landedCost: { increment: item.receiptUnitDelta! } },
        });

        // Sold / remaining quantities and the COGS change are facts of the
        // posting moment (sales may have happened since the draft was saved).
        await tx.additionalExpenseItem.update({
          where: { expense: { tenantId }, id: item.id },
          data: {
            soldQuantity: line.soldQuantity,
            remainingQuantity: line.remainingQuantity,
            cogsAdjustment,
          },
        });
      }

      // The receipt total is in the receipt currency (ADR 0023): add the
      // stored receipt-currency shares, the same amount cancelling removes.
      await tx.purchaseReceipt.update({
        where: { tenantId, id: expense.receiptId },
        data: {
          additionalExpensesTotal: {
            increment: sumDecimal(storedItems.map((i) => i.receiptAmount!)),
          },
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
        const debitedCashAccount = await tx.cashAccount.update({
          where: { tenantId, id: paidCashAccountId },
          data: { balance: { decrement: totalAmount } },
        });
        if (Number(debitedCashAccount.balance) < 0) {
          throw new BadRequestException("Kassada mablag' yetarli emas");
        }

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
            exchangeRate: allocation.expenseRate,
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
        // UZS amounts from the stored snapshot (the expense's own rate,
        // ADR 0008). The VAT share is left as it was posted before (see
        // the 2910 / batch VAT note in the report): out of scope here.
        const baseTotal = sumDecimal(storedItems.map((i) => i.baseAmount!));
        const vatBase = new Prisma.Decimal(expense.vatAmount)
          .mul(allocation.expenseRate)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const netStock = Prisma.Decimal.max(
          0,
          baseTotal.sub(totalCogsAdjustment).sub(vatBase),
        ).toNumber();
        const cogsTotal = totalCogsAdjustment.toNumber();

        if (inventoryAcc && netStock > 0) {
          journalLines.push({
            debitAccountId: inventoryAcc.id,
            creditAccountId: creditAcc.id,
            amount: netStock,
            description:
              'Ombordagi tovarlar tannarxiga xarajat kapitalizatsiyasi',
          });
        }

        if (cogsAcc && cogsTotal > 0) {
          journalLines.push({
            debitAccountId: cogsAcc.id,
            creditAccountId: creditAcc.id,
            amount: cogsTotal,
            description:
              'Sotilgan tovarlar tannarxiga (COGS) retroaktiv xarajat taqsimoti',
          });
        }

        if (vatAcc && Number(expense.vatAmount) > 0) {
          journalLines.push({
            debitAccountId: vatAcc.id,
            creditAccountId: creditAcc.id,
            amount: vatBase.toNumber(),
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
          consumptionCostRevalued: true,
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

  /**
   * A posted sales return re-entered stock and reversed 9110 at the
   * consumption cost the expense raised (ADR 0012). Cancelling the expense
   * takes that delta off the sale but not off the return, so it is refused
   * while such a return is posted: cancel the return first. Draft and
   * cancelled returns do not block (a draft reads its cost when confirmed).
   *
   * The sales consumptions are locked first: a return being confirmed at the
   * same time locks them too (FOR SHARE), so either it commits first and is
   * found here, or it waits and then reads the restored cost.
   */
  private async assertNoPostedReturnOfRevaluedSales(
    tx: Prisma.TransactionClient,
    tenantId: string,
    receiptId: string,
    productIds: string[],
  ) {
    if (productIds.length === 0) return;
    const sold = await tx.$queryRaw<
      { invoice_id: string; product_id: string }[]
    >(Prisma.sql`
      SELECT sii.invoice_id, b.product_id
      FROM batch_consumptions c
      JOIN product_batches b ON b.id = c.batch_id AND b.tenant_id = c.tenant_id
      JOIN sales_invoice_items sii ON sii.id = c.sales_invoice_item_id
      WHERE c.tenant_id = ${tenantId}
        AND b.receipt_id = ${receiptId}
        AND b.product_id IN (${Prisma.join(productIds)})
        AND c.sales_invoice_item_id IS NOT NULL
      FOR UPDATE OF c`);
    if (sold.length === 0) return;

    // Returns are per product of an invoice, so (invoice, product) is the key.
    const revalued = new Set(
      sold.map((r) => `${r.invoice_id}:${r.product_id}`),
    );
    const returns = await tx.salesReturn.findMany({
      where: {
        tenantId,
        status: SalesReturnDocStatus.POSTED,
        invoiceId: { in: [...new Set(sold.map((r) => r.invoice_id))] },
      },
      select: {
        id: true,
        returnNumber: true,
        invoiceId: true,
        items: { select: { productId: true } },
      },
      orderBy: { returnNumber: 'asc' },
    });
    const blocking = returns.filter((r) =>
      r.items.some((i) => revalued.has(`${r.invoiceId}:${i.productId}`)),
    );
    if (blocking.length > 0) {
      const list = blocking
        .map((r) => `${r.returnNumber} (${r.id})`)
        .join(', ');
      throw new BadRequestException(
        `Bu xarajat tannarxini oshirgan sotuvlar bo'yicha tasdiqlangan qaytarishlar bor: ${list}. Avval ularni bekor qiling. / По продажам, себестоимость которых увеличил этот расход, есть проведённые возвраты: ${list}. Сначала отмените их.`,
      );
    }
  }

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

    // Rollback Guardrail: a later Finance payment (linked directly, or applied
    // to this expense by FIFO) must be cancelled in Finance first. The cash
    // payment made when the expense was posted as paid has no settlement side
    // and is reversed together with the document below.
    const [linkedTx, allocations] = await Promise.all([
      this.prisma.financeTransaction.findFirst({
        where: {
          tenantId,
          sourceDocType: 'AdditionalExpense',
          sourceDocId: id,
          status: 'POSTED',
          isDeleted: false,
          settlementSide: { not: null },
        },
      }),
      this.prisma.settlementAllocation.findMany({
        where: {
          tenantId,
          targetType: SettlementAllocationTarget.ADDITIONAL_EXPENSE,
          targetId: id,
        },
        select: { amount: true },
      }),
    ]);
    const allocatedAmount = allocations.reduce(
      (sum, allocation) => sum + Number(allocation.amount),
      0,
    );

    if (linkedTx || allocatedAmount > 0.000001) {
      throw new BadRequestException(
        "Ushbu xarajat bo'yicha kassa to'lovi mavjud. Avval Moliya bo'limidan kassa to'lovini bekor qiling.",
      );
    }

    // Cancelling reverses the stored conversion. A posted row without one
    // (its rate could not be read when the snapshot was backfilled) is
    // refused: a fresh rate would not undo what posting did.
    if (
      expense.items.some(
        (i) =>
          i.baseUnitDelta == null ||
          i.receiptAmount == null ||
          i.originalCurrency == null,
      )
    ) {
      throw new BadRequestException(
        "Bu xarajatning kurs ma'lumotlari saqlanmagan, uni aniq bekor qilib bo'lmaydi — administratorga murojaat qiling / У расхода не сохранены данные о курсе, его нельзя точно отменить — обратитесь к администратору",
      );
    }

    const totalAmount = Number(expense.amount);

    return this.prisma.$transaction(async (tx) => {
      // Lock the row: a second cancel running at the same time must not
      // reverse the expense twice.
      const lockedStatus = await lockDocumentStatus(
        tx,
        'additionalExpense',
        id,
        tenantId,
      );
      if (lockedStatus !== PurchaseDocStatus.POSTED) {
        throw new BadRequestException(
          'Faqat tasdiqlangan holatidagi xarajatlarni bekor qilish mumkin',
        );
      }
      // D4: nothing dated in a closed accounting period may change.
      await assertPeriodOpen(tx, tenantId, expense.docDate, 'cancel');
      await this.assertNoPostedReturnOfRevaluedSales(
        tx,
        tenantId,
        expense.receiptId,
        expense.items.map((i) => i.productId),
      );

      // Return the cash paid when the expense was posted as paid. Its credit
      // to cash sits in the expense's own journal entry, deleted below.
      const postingPayment = await tx.financeTransaction.findFirst({
        where: {
          tenantId,
          sourceDocType: 'AdditionalExpense',
          sourceDocId: id,
          status: 'POSTED',
          isDeleted: false,
          settlementSide: null,
        },
      });
      if (postingPayment) {
        if (!postingPayment.accountId) {
          throw new BadRequestException(
            "Qo'shimcha xarajat to'lovining kassa hisobi ko'rsatilmagan",
          );
        }
        await tx.cashAccount.update({
          where: { tenantId, id: postingPayment.accountId },
          data: { balance: { increment: postingPayment.amount } },
        });
        const cancelled = await tx.financeTransaction.updateMany({
          where: { id: postingPayment.id, tenantId, status: 'POSTED' },
          data: {
            status: 'CANCELLED',
            cancelledById: userId || null,
            cancelledAt: new Date(),
            cancellationReason: `Qo'shimcha xarajat ${expense.docNumber} bekor qilindi`,
          },
        });
        if (cancelled.count !== 1) {
          throw new BadRequestException(
            "Qo'shimcha xarajat to'lovi allaqachon bekor qilingan",
          );
        }
      }
      // 1. Reverse exactly what posting applied, from the stored snapshot
      // only (never a fresh rate): the same revalueBatch() with -1, the
      // stored receipt-currency delta off the receipt line, and the stored
      // receipt-currency shares off the receipt total.
      for (const item of expense.items) {
        await this.revalueBatch(
          tx,
          tenantId,
          expense.receiptId,
          item.productId,
          new Prisma.Decimal(item.baseUnitDelta!),
          -1,
          // Postings from before consumptions were revalued added nothing
          // to them: subtract only what this posting added.
          expense.consumptionCostRevalued,
        );
        // Rows posted before the snapshot existed never had their line
        // revalued in the receipt currency (receiptUnitDelta NULL): leave it.
        if (item.receiptUnitDelta != null) {
          await tx.purchaseReceiptItem.update({
            where: { receipt: { tenantId }, id: item.receiptItemId },
            data: { landedCost: { decrement: item.receiptUnitDelta } },
          });
        }
      }
      await tx.purchaseReceipt.update({
        where: { tenantId, id: expense.receiptId },
        data: {
          additionalExpensesTotal: {
            decrement: sumDecimal(expense.items.map((i) => i.receiptAmount!)),
          },
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

/** Sums Decimal (or numeric) values exactly. */
function sumDecimal(
  values: (Prisma.Decimal | number | string)[],
): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (sum, v) => sum.add(new Prisma.Decimal(v)),
    new Prisma.Decimal(0),
  );
}

/** The stored allocation lines: convertAndAllocate() output, unchanged. */
export function allocationRows(allocation: ConvertedAllocation) {
  return allocation.items.map((i) => ({
    receiptItemId: i.receiptItemId,
    productId: i.productId,
    initialLandedCost: i.initialLandedCost,
    allocatedAmount: i.allocatedAmount,
    newLandedCost: i.newLandedCost,
    soldQuantity: i.soldQuantity,
    remainingQuantity: i.remainingQuantity,
    cogsAdjustment: i.cogsAdjustment,
    originalCurrency: allocation.currency,
    expenseRate: allocation.expenseRate,
    receiptRate: allocation.receiptRate,
    rateDate: allocation.rateDate,
    rateSource: allocation.rateSource,
    receiptAmount: i.receiptAmount,
    baseAmount: i.baseAmount,
    receiptUnitDelta: i.receiptUnitDelta,
    baseUnitDelta: i.baseUnitDelta,
  }));
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
