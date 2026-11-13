import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { lockDocumentStatus } from '../../common/prisma/lock-document';
import { CreatePurchaseReceiptDto } from './dto/create-purchase-receipt.dto';
import { FilterPurchaseReceiptsDto } from './dto/filter-purchase-receipts.dto';
import { CreatePurchaseExpenseDto } from './dto/create-purchase-expense.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import {
  Prisma,
  PurchaseDocStatus,
  PurchasePaymentStatus,
  PurchaseReturnStatus,
  ReturnDocStatus,
  ExpenseAllocationMethod,
  TransactionDirection,
  CounterpartySettlementSide,
  SettlementAllocationTarget,
} from '@prisma/client';

import { nextDocumentNumber } from '../../common/sequences/document-sequence';
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
} from '../../common/validators/currency.validator';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../settlements/settlement-allocation.service';
import { AccountsService } from '../accounting/accounts/accounts.service';
import {
  isCashAccountCurrencyValid,
  ledgerAccountCodeForCashAccount,
} from '../../../../shared/types/cash-account-policy';
import {
  convertAmountToUzs,
  requireExchangeRateForCurrency,
} from '../../common/utils/transaction-exchange-rate';
import { JournalService } from '../accounting/journal/journal.service';
import type { JournalLineDto } from '../accounting/dto';
import {
  consumeFifoBatches,
  restoreBatchConsumptions,
} from '../inventory/fifo/fifo-batches';
import { assertTenantOwned } from '../../common/prisma/assert-tenant-owned';
import { formatMoney } from '../../../../shared/format/money';
import { assertPeriodOpen } from '../../common/accounting-period/period-lock';
import {
  accountingSettings,
  PURCHASE_RETURN_GAIN_ACCOUNT_SETTING,
} from '../../common/settings/accounting-settings';

type Numeric = number | string | Prisma.Decimal;

/** A purchase receipt with the lines and batches a return is matched against. */
type ReceiptForReturn = Prisma.PurchaseReceiptGetPayload<{
  include: { items: { include: { product: true } }; batches: true };
}>;

/** A purchase-return line as posting reads it (a stored line or a prepared one). */
interface ReturnPostingLine {
  id?: string;
  productId: string;
  quantity: Numeric;
  unitPrice: Numeric;
  vatAmount?: Numeric | null;
  product?: { type: string } | null;
}

/** A purchase return as posting reads it; links missing here come from `fallbackData`. */
interface PurchaseReturnForPosting {
  id: string;
  currency: string;
  /** UZS per unit of `currency`; the journal is kept in UZS. */
  exchangeRate: Numeric;
  returnDate: Date;
  returnNumber?: string;
  warehouseId?: string;
  counterpartyId?: string;
  receiptId?: string | null;
  items?: ReturnPostingLine[];
  receipt?: ReceiptForReturn | null;
  counterparty?: { name: string } | null;
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: CounterpartySettlementService,
    private readonly settlementAllocationService: SettlementAllocationService,
    private readonly accountsService: AccountsService,
    private readonly journalService: JournalService,
  ) {}

  // ─── RECEIPT NUMBER GENERATOR ─────────────────────────────────

  private async generateDocNumber(tenantId: string): Promise<string> {
    return nextDocumentNumber(this.prisma, tenantId, 'PURCHASE_RECEIPT');
  }

  private async generateReturnNumber(tenantId: string): Promise<string> {
    return nextDocumentNumber(this.prisma, tenantId, 'PURCHASE_RETURN');
  }

  // ─── RECEIPTS ─────────────────────────────────────────────────

  async findAllReceipts(tenantId: string, filters: FilterPurchaseReceiptsDto) {
    const {
      search,
      counterpartyId,
      warehouseId,
      status,
      currency,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
    } = filters;

    const where: Prisma.PurchaseReceiptWhereInput = {
      tenantId,
    };

    if (search) {
      where.OR = [
        { docNumber: { contains: search, mode: 'insensitive' } },
        { counterparty: { name: { contains: search, mode: 'insensitive' } } },
        { comment: { contains: search, mode: 'insensitive' } },
        { gtdNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (counterpartyId) where.counterpartyId = counterpartyId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status as PurchaseDocStatus;
    if (currency) where.currency = currency;

    if (dateFrom || dateTo) {
      where.docDate = {};
      if (dateFrom) where.docDate.gte = new Date(dateFrom);
      if (dateTo) where.docDate.lte = new Date(dateTo);
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.totalAmount = {};
      if (minAmount !== undefined) where.totalAmount.gte = minAmount;
      if (maxAmount !== undefined) where.totalAmount.lte = maxAmount;
    }

    return this.prisma.purchaseReceipt.findMany({
      where,
      include: {
        counterparty: true,
        warehouse: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        postedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: {
          include: {
            product: true,
          },
        },
        expenses: true,
        returns: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneReceipt(tenantId: string, id: string) {
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id, tenantId },
      include: {
        counterparty: true,
        warehouse: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        postedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: {
          include: {
            product: true,
          },
        },
        expenses: {
          include: {
            supplier: true,
          },
        },
        returns: {
          include: {
            items: {
              include: { product: true },
            },
          },
        },
        batches: true,
      },
    });

    if (!receipt) {
      throw new NotFoundException('Xarid hujjati topilmadi');
    }

    return receipt;
  }

  async createReceipt(
    tenantId: string,
    userId: string,
    dto: CreatePurchaseReceiptDto,
  ) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException(
        "Xarid hujjatida kamida bitta tovar bo'lishi shart",
      );
    }

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

    for (const item of dto.items) {
      const qty = Number(item.quantity);
      if (item.quantity == null || isNaN(qty) || qty <= 0) {
        throw new BadRequestException(
          "Xarid qatorida miqdor (quantity) 0 dan katta bo'lishi shart",
        );
      }
      const unitPrice = Number(item.unitPrice);
      if (item.unitPrice == null || isNaN(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(
          "Xarid qatorida narx (unitPrice) 0 yoki undan katta bo'lishi shart",
        );
      }
      if (
        item.discount != null &&
        (isNaN(Number(item.discount)) || Number(item.discount) < 0)
      ) {
        throw new BadRequestException(
          "Chegirma (discount) 0 yoki undan katta bo'lishi shart",
        );
      }
    }

    await assertTenantOwned(this.prisma, tenantId, {
      counterparty: dto.counterpartyId,
      warehouse: dto.warehouseId,
      product: dto.items.map((item) => item.productId),
    });

    const docNumber = await this.generateDocNumber(tenantId);

    let subtotalAmount = 0;
    let discountAmount = 0;
    let vatAmount = 0;

    const preparedItems = dto.items.map((item) => {
      const qty = Number(item.quantity);
      const weight = item.weight ? Number(item.weight) : 0;
      const unitPrice = Number(item.unitPrice);
      const disc = item.discount ? Number(item.discount) : 0;
      const vatRate = item.vatRate ? Number(item.vatRate) : 0;

      const itemSubtotal = qty * unitPrice;
      const itemAfterDisc = Math.max(0, itemSubtotal - disc);
      const itemVat = (itemAfterDisc * vatRate) / 100;
      const itemTotal = itemAfterDisc + itemVat;

      subtotalAmount += itemSubtotal;
      discountAmount += disc;
      vatAmount += itemVat;

      const landedCost = qty > 0 ? itemTotal / qty : 0;

      return {
        productId: item.productId,
        quantity: qty,
        weight: weight,
        unitPrice: unitPrice,
        discount: disc,
        vatRate: vatRate,
        vatAmount: itemVat,
        totalPrice: itemTotal,
        allocatedExpenses: 0,
        landedCost: landedCost,
      };
    });

    const totalAmount = subtotalAmount - discountAmount + vatAmount;

    const receipt = await this.prisma.purchaseReceipt.create({
      data: {
        tenantId,
        docNumber,
        docDate: dto.docDate ? new Date(dto.docDate) : new Date(),
        counterpartyId: dto.counterpartyId,
        warehouseId: dto.warehouseId,
        currency: dto.currency,
        exchangeRate: exchangeRate,
        contractNumber: dto.contractNumber || null,
        contractDate: dto.contractDate ? new Date(dto.contractDate) : null,
        comment: dto.comment || null,
        status: PurchaseDocStatus.DRAFT,
        paymentStatus: PurchasePaymentStatus.UNPAID,
        returnStatus: PurchaseReturnStatus.NONE,
        subtotalAmount,
        discountAmount,
        vatAmount,
        additionalExpensesTotal: 0,
        totalAmount,
        paidAmount: 0,
        gtdNumber: dto.gtdNumber || null,
        gtdDate: dto.gtdDate ? new Date(dto.gtdDate) : null,
        customsPost: dto.customsPost || null,
        createdById: userId,
        items: {
          create: preparedItems,
        },
      },
      include: {
        counterparty: true,
        warehouse: true,
        items: { include: { product: true } },
      },
    });

    if (dto.postImmediately) {
      return this.postReceipt(tenantId, userId, receipt.id);
    }

    return receipt;
  }

  async updateReceipt(
    tenantId: string,
    id: string,
    dto: CreatePurchaseReceiptDto,
  ) {
    const existing = await this.prisma.purchaseReceipt.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Xarid hujjati topilmadi');
    }

    if (existing.status !== PurchaseDocStatus.DRAFT) {
      throw new BadRequestException(
        'Faqat qoralama holatidagi xarid hujjatlarini tahrirlash mumkin',
      );
    }

    await assertTenantOwned(this.prisma, tenantId, {
      counterparty: dto.counterpartyId,
      warehouse: dto.warehouseId,
      product: dto.items?.map((item) => item.productId),
    });

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

    for (const item of dto.items) {
      const qty = Number(item.quantity);
      if (item.quantity == null || isNaN(qty) || qty <= 0) {
        throw new BadRequestException(
          "Xarid qatorida miqdor (quantity) 0 dan katta bo'lishi shart",
        );
      }
      const unitPrice = Number(item.unitPrice);
      if (item.unitPrice == null || isNaN(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(
          "Xarid qatorida narx (unitPrice) 0 yoki undan katta bo'lishi shart",
        );
      }
      if (
        item.discount != null &&
        (isNaN(Number(item.discount)) || Number(item.discount) < 0)
      ) {
        throw new BadRequestException(
          "Chegirma (discount) 0 yoki undan katta bo'lishi shart",
        );
      }
    }

    let subtotalAmount = 0;
    let discountAmount = 0;
    let vatAmount = 0;

    const preparedItems = dto.items.map((item) => {
      const qty = Number(item.quantity);
      const weight = item.weight ? Number(item.weight) : 0;
      const unitPrice = Number(item.unitPrice);
      const disc = item.discount ? Number(item.discount) : 0;
      const vatRate = item.vatRate ? Number(item.vatRate) : 0;

      const itemSubtotal = qty * unitPrice;
      const itemAfterDisc = Math.max(0, itemSubtotal - disc);
      const itemVat = (itemAfterDisc * vatRate) / 100;
      const itemTotal = itemAfterDisc + itemVat;

      subtotalAmount += itemSubtotal;
      discountAmount += disc;
      vatAmount += itemVat;

      const landedCost = qty > 0 ? itemTotal / qty : 0;

      return {
        productId: item.productId,
        quantity: qty,
        weight: weight,
        unitPrice: unitPrice,
        discount: disc,
        vatRate: vatRate,
        vatAmount: itemVat,
        totalPrice: itemTotal,
        allocatedExpenses: 0,
        landedCost: landedCost,
      };
    });

    const totalAmount =
      subtotalAmount -
      discountAmount +
      vatAmount +
      Number(existing.additionalExpensesTotal);

    return this.prisma.$transaction(async (tx) => {
      // F9: lock the row and re-check the status inside the transaction; a
      // post committed after the check above must not have its lines replaced.
      const lockedStatus = await lockDocumentStatus(
        tx,
        'purchaseReceipt',
        id,
        tenantId,
      );
      if (lockedStatus === null) {
        throw new NotFoundException('Xarid hujjati topilmadi');
      }
      if (lockedStatus !== PurchaseDocStatus.DRAFT) {
        throw new BadRequestException(
          'Faqat qoralama holatidagi xarid hujjatlarini tahrirlash mumkin',
        );
      }
      await tx.purchaseReceiptItem.deleteMany({
        where: { receipt: { tenantId }, receiptId: id },
      });

      return tx.purchaseReceipt.update({
        where: { tenantId, id },
        data: {
          counterpartyId: dto.counterpartyId,
          warehouseId: dto.warehouseId,
          docDate: dto.docDate ? new Date(dto.docDate) : existing.docDate,
          currency: dto.currency || existing.currency,
          exchangeRate: exchangeRate,
          contractNumber: dto.contractNumber ?? existing.contractNumber,
          contractDate: dto.contractDate
            ? new Date(dto.contractDate)
            : existing.contractDate,
          comment: dto.comment ?? existing.comment,
          gtdNumber: dto.gtdNumber ?? existing.gtdNumber,
          gtdDate: dto.gtdDate ? new Date(dto.gtdDate) : existing.gtdDate,
          customsPost: dto.customsPost ?? existing.customsPost,
          subtotalAmount,
          discountAmount,
          vatAmount,
          totalAmount,
          items: {
            create: preparedItems,
          },
        },
        include: {
          counterparty: true,
          warehouse: true,
          items: { include: { product: true } },
          expenses: true,
        },
      });
    });
  }

  // ─── POSTING & UNPOSTING ──────────────────────────────────────

  async postReceipt(tenantId: string, userId: string, id: string) {
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { product: true } },
        counterparty: true,
        expenses: true,
      },
    });

    if (!receipt) {
      throw new NotFoundException('Xarid hujjati topilmadi');
    }

    if (receipt.status !== PurchaseDocStatus.DRAFT) {
      throw new BadRequestException(
        'Ushbu hujjat allaqachon tasdiqlangan yoki bekor qilingan',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Update stock levels & create batches (physical items only)
      for (const item of receipt.items) {
        const itemType = item.product?.type || 'PRODUCT';
        if (itemType === 'SERVICE') {
          // Services do not increment physical stock or create product batches
          continue;
        }

        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: receipt.warehouseId,
              productId: item.productId,
            },
          },
        });

        if (stockLevel) {
          await tx.stockLevel.update({
            where: { tenantId, id: stockLevel.id },
            data: {
              quantity: { increment: item.quantity },
            },
          });
        } else {
          await tx.stockLevel.create({
            data: {
              tenantId,
              warehouseId: receipt.warehouseId,
              productId: item.productId,
              quantity: item.quantity,
              reservedQuantity: 0,
            },
          });
        }

        const rate = requireExchangeRateForCurrency(
          receipt.currency,
          receipt.exchangeRate == null
            ? undefined
            : Number(receipt.exchangeRate),
        );
        const purchasePriceInBase =
          Math.round(Number(item.unitPrice) * rate * 100) / 100;
        const landedCostInBase =
          Math.round(Number(item.landedCost) * rate * 100) / 100;

        // Create product batch record
        await tx.productBatch.create({
          data: {
            tenantId,
            productId: item.productId,
            warehouseId: receipt.warehouseId,
            receiptId: receipt.id,
            batchNumber: `${receipt.docNumber}-${item.id.substring(0, 6)}`,
            initialQty: item.quantity,
            remainingQty: item.quantity,
            purchasePrice: purchasePriceInBase,
            landedCost: landedCostInBase,
          },
        });

        // Sync Product catalog costPrice in base currency
        if (tx.product?.update) {
          await tx.product.update({
            where: { tenantId, id: item.productId },
            data: {
              costPrice: landedCostInBase,
              costPriceCurrency: 'UZS',
              costPriceExchangeRate: 1,
            },
          });
        }
      }

      // 2. Accrue supplier payable in the receipt's native currency.
      await this.settlementService.recordMovement(tx, {
        tenantId,
        counterpartyId: receipt.counterpartyId,
        currency: receipt.currency,
        side: CounterpartySettlementSide.SUPPLIER,
        amount: Number(receipt.totalAmount),
        entryType: 'PURCHASE_RECEIPT_POSTED',
        effectiveAt: receipt.docDate,
        sourceDocType: 'PurchaseReceipt',
        sourceDocId: receipt.id,
        idempotencyKey: `PurchaseReceipt:${receipt.id}:POSTED:${receipt.updatedAt.toISOString()}`,
      });

      // 3. Accounting journal entries according to BHMS / NAS Standard
      // Debit 2910 (Finished Goods / Tovarlar): Net product cost + allocated expenses
      // Debit 1010 (Raw Materials & Supplies / Xomashyo): Net raw material cost + allocated expenses
      // Debit 9420/9430 (Operating Expense / Xizmat xarajatlari): Service costs
      // Debit 4410 (Input VAT / Kiruvchi QQS): VAT amount
      // Credit 6010 (Accounts Payable / Yetkazib beruvchiga qarz): Total Amount

      const inventoryAcc = await tx.account.findFirst({
        where: { tenantId, code: '2910' },
      });
      const rawMaterialAcc =
        (await tx.account.findFirst({
          where: { tenantId, code: '1010' },
        })) || inventoryAcc;
      const serviceExpenseAcc =
        (await tx.account.findFirst({
          where: { tenantId, code: '9420' },
        })) ||
        (await tx.account.findFirst({
          where: { tenantId, code: '9430' },
        })) ||
        inventoryAcc;
      const vatAcc = await tx.account.findFirst({
        where: { tenantId, code: '4410' },
      });
      const supplierAcc = await tx.account.findFirst({
        where: { tenantId, code: '6010' },
      });

      if (supplierAcc) {
        let productSum = 0;
        let rawMaterialSum = 0;
        let serviceSum = 0;

        const rate = requireExchangeRateForCurrency(
          receipt.currency,
          receipt.exchangeRate == null
            ? undefined
            : Number(receipt.exchangeRate),
        );
        const totalNet =
          Math.round(
            (Number(receipt.subtotalAmount || 0) -
              Number(receipt.discountAmount || 0) +
              Number(receipt.additionalExpensesTotal || 0)) *
              rate *
              100,
          ) / 100;

        const hasSpecialTypes = receipt.items.some(
          (i) =>
            i.product?.type === 'RAW_MATERIAL' || i.product?.type === 'SERVICE',
        );

        if (!hasSpecialTypes) {
          productSum = totalNet;
        } else {
          for (const item of receipt.items) {
            const lineTotal =
              (item.totalPrice !== undefined
                ? Number(item.totalPrice)
                : Number(item.quantity || 0) * Number(item.unitPrice || 0)) *
              rate;
            const allocated = Number(item.allocatedExpenses || 0) * rate;
            const itemNet = Math.round((lineTotal + allocated) * 100) / 100;
            const itemType = item.product?.type || 'PRODUCT';

            if (itemType === 'RAW_MATERIAL') {
              rawMaterialSum += itemNet;
            } else if (itemType === 'SERVICE') {
              serviceSum += Math.round(lineTotal * 100) / 100;
            } else {
              productSum += itemNet;
            }
          }
        }

        const vatSum = Math.round(Number(receipt.vatAmount) * rate * 100) / 100;
        const journalLines: JournalLineDto[] = [];

        if (productSum > 0 && inventoryAcc) {
          journalLines.push({
            debitAccountId: inventoryAcc.id,
            creditAccountId: supplierAcc.id,
            amount: productSum,
            description: `Kiruvchi tovarlar va taqsimlangan xarajatlar qiymati (№ ${receipt.docNumber})`,
          });
        }

        if (rawMaterialSum > 0 && rawMaterialAcc) {
          journalLines.push({
            debitAccountId: rawMaterialAcc.id,
            creditAccountId: supplierAcc.id,
            amount: rawMaterialSum,
            description: `Kiruvchi xomashyo va materiallar qiymati (№ ${receipt.docNumber})`,
          });
        }

        if (serviceSum > 0 && serviceExpenseAcc) {
          journalLines.push({
            debitAccountId: serviceExpenseAcc.id,
            creditAccountId: supplierAcc.id,
            amount: serviceSum,
            description: `Xarid bo‘yicha ko‘rsatilgan xizmatlar xarajati (№ ${receipt.docNumber})`,
          });
        }

        if (vatSum > 0 && vatAcc) {
          journalLines.push({
            debitAccountId: vatAcc.id,
            creditAccountId: supplierAcc.id,
            amount: vatSum,
            description: `Hisobga olingan kiruvchi QQS (№ ${receipt.docNumber})`,
          });
        }

        if (journalLines.length > 0) {
          await this.journalService.createJournalEntry(
            tenantId,
            {
              entryDate: receipt.docDate,
              description: `Nomenklatura qabul qilish № ${receipt.docNumber} (${receipt.counterparty.name})`,
              sourceDocType: 'PurchaseReceipt',
              sourceDocId: receipt.id,
              lines: journalLines,
            },
            tx,
          );
        }
      }

      // 4. Record Audit Log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'PurchaseReceipt',
          entityId: receipt.id,
          action: 'UPDATE',
          oldValue: { status: 'DRAFT' },
          newValue: { status: 'POSTED', postedAt: new Date() },
        },
      });

      // 5. Update purchase receipt status
      return tx.purchaseReceipt.update({
        where: { tenantId, id: receipt.id },
        data: {
          status: PurchaseDocStatus.POSTED,
          postedById: userId,
          postedAt: new Date(),
        },
        include: {
          counterparty: true,
          warehouse: true,
          items: { include: { product: true } },
          expenses: true,
          batches: true,
        },
      });
    });
  }

  async unpostReceipt(tenantId: string, userId: string, id: string) {
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        counterparty: true,
      },
    });

    if (!receipt) {
      throw new NotFoundException('Xarid hujjati topilmadi');
    }

    if (receipt.status !== PurchaseDocStatus.POSTED) {
      throw new BadRequestException(
        'Faqat tasdiqlangan hujjatlarni bekor qilish mumkin',
      );
    }

    // Safety validation for linked payments & returns
    if (
      Number(receipt.paidAmount) > 0 ||
      receipt.paymentStatus !== PurchasePaymentStatus.UNPAID
    ) {
      throw new BadRequestException(
        `Ushbu xarid hujjati bo'yicha to'lovlar kiritilgan (To'langan: ${receipt.paidAmount.toString()} ${receipt.currency}). Hujjatni bekor qilishdan avval Moliya modulida unga bog'liq to'lovlarni o'chiring.`,
      );
    }

    if (receipt.returnStatus !== PurchaseReturnStatus.NONE) {
      throw new BadRequestException(
        "Ushbu xarid hujjati bo'yicha to'liq yoki qisman qaytarish rasmiylashtirilgan. Avval qaytaruv hujjatlarini o'chiring.",
      );
    }

    const postedExpense = await this.prisma.additionalExpense.findFirst({
      where: { tenantId, receiptId: id, status: PurchaseDocStatus.POSTED },
      select: { id: true, docNumber: true },
    });
    if (postedExpense) {
      throw new BadRequestException(
        `Ushbu xarid hujjatiga ${postedExpense.docNumber} qo'shimcha xarajati kapitalizatsiya qilingan. Avval xarajat hujjatini bekor qiling.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // D4: nothing dated in a closed accounting period may change.
      await assertPeriodOpen(tx, tenantId, receipt.docDate, 'unpost');
      // 1. Decrement stock levels & delete batches
      for (const item of receipt.items) {
        const itemType = item.product?.type || 'PRODUCT';
        if (itemType === 'SERVICE') {
          // Services do not have physical warehouse stock or product batches
          continue;
        }

        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: receipt.warehouseId,
              productId: item.productId,
            },
          },
        });

        if (
          !stockLevel ||
          Number(stockLevel.quantity) < Number(item.quantity)
        ) {
          throw new BadRequestException(
            `Xaridni bekor qilish imkonsiz: ${item.productId} bo'yicha omborda yetarli qoldiq mavjud emas`,
          );
        }

        await tx.stockLevel.update({
          where: { tenantId, id: stockLevel.id },
          data: {
            quantity: Number(stockLevel.quantity) - Number(item.quantity),
          },
        });
      }

      await tx.productBatch.deleteMany({
        where: { tenantId, receiptId: id },
      });

      // 2. Reverse the supplier payable without deleting its history.
      await this.settlementService.recordMovement(tx, {
        tenantId,
        counterpartyId: receipt.counterpartyId,
        currency: receipt.currency,
        side: CounterpartySettlementSide.SUPPLIER,
        amount: -Number(receipt.totalAmount),
        entryType: 'PURCHASE_RECEIPT_UNPOSTED',
        effectiveAt: receipt.docDate,
        sourceDocType: 'PurchaseReceipt',
        sourceDocId: receipt.id,
        idempotencyKey: `PurchaseReceipt:${receipt.id}:UNPOSTED:${receipt.updatedAt.toISOString()}`,
      });

      // 3. Remove journal entries
      await this.journalService.deleteEntriesForSource(
        tx,
        tenantId,
        'PurchaseReceipt',
        id,
        'unpost',
      );

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'PurchaseReceipt',
          entityId: receipt.id,
          action: 'UPDATE',
          oldValue: { status: receipt.status },
          newValue: { status: 'DRAFT' },
        },
      });

      // 5. Update status
      return tx.purchaseReceipt.update({
        where: { tenantId, id },
        data: {
          status: PurchaseDocStatus.DRAFT,
          postedById: null,
          postedAt: null,
        },
        include: {
          counterparty: true,
          warehouse: true,
          items: { include: { product: true } },
          expenses: true,
        },
      });
    });
  }

  // ─── PAY PURCHASE RECEIPT ─────────────────────────────────────

  async payPurchaseReceipt(
    tenantId: string,
    userId: string,
    id: string,
    dto: {
      amount: number;
      cashAccountId: string;
      exchangeRate?: number;
      note?: string;
      paymentDate?: string;
    },
  ) {
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id, tenantId },
      include: { counterparty: true },
    });

    if (!receipt) {
      throw new NotFoundException('Xarid hujjati topilmadi');
    }

    if (receipt.status !== PurchaseDocStatus.POSTED) {
      throw new BadRequestException(
        "Faqat tasdiqlangan hujjatlar uchun to'lov kiritish mumkin",
      );
    }

    if (receipt.paymentStatus === PurchasePaymentStatus.PAID) {
      throw new BadRequestException("Ushbu hujjat to'liq to'langan");
    }

    const cashAccount = await this.prisma.cashAccount.findFirst({
      where: { id: dto.cashAccountId, tenantId, isActive: true },
    });

    if (!cashAccount) {
      throw new NotFoundException('Kassa hisobi topilmadi');
    }

    if (
      !isCashAccountCurrencyValid(cashAccount) ||
      cashAccount.currency !== receipt.currency
    ) {
      throw new BadRequestException(
        `Tanlangan kassa turi/valyutasi xarid hujjatiga (${receipt.currency}) mos kelmaydi.`,
      );
    }

    if (Number(cashAccount.balance) < dto.amount) {
      throw new BadRequestException(
        `Kassada mablag' yetarli emas. Mavjud: ${formatMoney(Number(cashAccount.balance), cashAccount.currency)}, To'lov: ${formatMoney(dto.amount, receipt.currency)}`,
      );
    }

    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();
    const exchangeRate = requireExchangeRateForCurrency(
      receipt.currency,
      dto.exchangeRate,
    );
    const receiptExchangeRate = requireExchangeRateForCurrency(
      receipt.currency,
      receipt.currency === 'UZS' ? undefined : Number(receipt.exchangeRate),
    );
    const remaining = Number(receipt.totalAmount) - Number(receipt.paidAmount);
    const payAmount = Math.min(dto.amount, remaining);

    if (payAmount <= 0) {
      throw new BadRequestException("To'lov summasi noto'g'ri");
    }
    const paymentAmountInUzs = convertAmountToUzs(
      payAmount,
      receipt.currency,
      exchangeRate,
    );
    const payableReductionInUzs = convertAmountToUzs(
      payAmount,
      receipt.currency,
      receiptExchangeRate,
    );

    await this.accountsService.ensureDefaultAccounts(tenantId);

    return this.prisma.$transaction(async (tx) => {
      const newPaidAmount = Number(receipt.paidAmount) + payAmount;
      const newPaymentStatus =
        newPaidAmount >= Number(receipt.totalAmount)
          ? PurchasePaymentStatus.PAID
          : PurchasePaymentStatus.PARTIALLY_PAID;

      // 1. Decrement CashAccount balance
      await tx.cashAccount.update({
        where: { tenantId, id: dto.cashAccountId },
        data: { balance: { decrement: payAmount } },
      });

      // 2. Create Finance Transaction (EXPENSE)
      const txNumber = await nextDocumentNumber(
        tx,
        tenantId,
        'FINANCE_TRANSACTION',
      );

      const financeTransaction = await tx.financeTransaction.create({
        data: {
          tenantId,
          docNumber: txNumber,
          direction: TransactionDirection.EXPENSE,
          amount: payAmount,
          currency: cashAccount.currency,
          exchangeRate,
          transactionDate: paymentDate,
          settlementSide: CounterpartySettlementSide.SUPPLIER,
          comment:
            dto.note ||
            `Yetkazib beruvchiga to'lov: ${receipt.counterparty.name} (${receipt.docNumber})`,
          accountId: dto.cashAccountId,
          counterpartyId: receipt.counterpartyId,
          sourceDocType: 'PurchaseReceipt',
          sourceDocId: receipt.id,
          createdById: userId,
        },
      });

      await this.settlementService.recordMovement(tx, {
        tenantId,
        counterpartyId: receipt.counterpartyId,
        currency: receipt.currency,
        side: CounterpartySettlementSide.SUPPLIER,
        amount: -payAmount,
        entryType: 'FINANCE_SETTLEMENT',
        effectiveAt: paymentDate,
        sourceDocType: 'FinanceTransaction',
        sourceDocId: financeTransaction.id,
        idempotencyKey: `FinanceTransaction:${financeTransaction.id}:SETTLEMENT`,
      });
      await this.settlementAllocationService.recordAllocation(tx, {
        tenantId,
        counterpartyId: receipt.counterpartyId,
        financeTransactionId: financeTransaction.id,
        targetType: SettlementAllocationTarget.PURCHASE_RECEIPT,
        targetId: receipt.id,
        amount: payAmount,
        idempotencyKey: `FinanceTransaction:${financeTransaction.id}:PurchaseReceipt:${receipt.id}`,
      });

      // 3. Update receipt paidAmount and paymentStatus after validating the allocation.
      const updatedReceipt = await tx.purchaseReceipt.update({
        where: { tenantId, id },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: newPaymentStatus,
        },
        include: { counterparty: true, warehouse: true },
      });

      // 5. Credit the chart account corresponding to this exact cash/bank account.
      const supplierAcc = await tx.account.findFirst({
        where: { tenantId, code: '6010' },
      });
      const cashLedgerAccountCode =
        ledgerAccountCodeForCashAccount(cashAccount);
      const cashAcc = await tx.account.findFirst({
        where: {
          tenantId,
          code: cashLedgerAccountCode ?? '__INVALID_CASH_ACCOUNT__',
        },
      });

      if (supplierAcc && cashAcc) {
        const exchangeDifference =
          Math.round((paymentAmountInUzs - payableReductionInUzs) * 100) / 100;
        const journalLines: Array<{
          debitAccountId: string;
          creditAccountId: string;
          amount: number;
          description: string;
        }> = [
          {
            debitAccountId: supplierAcc.id,
            creditAccountId: cashAcc.id,
            amount: Math.min(paymentAmountInUzs, payableReductionInUzs),
            description: `Yetkazib beruvchi qarzi kamaymasi / Kassadan chiqim (${payAmount} ${receipt.currency})`,
          },
        ];

        if (exchangeDifference > 0) {
          const exchangeLossAcc = await tx.account.findFirst({
            where: { tenantId, code: '9620' },
          });
          if (!exchangeLossAcc)
            throw new BadRequestException(
              'Valyuta kursi zarar hisobi (9620) topilmadi',
            );
          journalLines.push({
            debitAccountId: exchangeLossAcc.id,
            creditAccountId: cashAcc.id,
            amount: exchangeDifference,
            description: `Xarid to‘lovi bo‘yicha valyuta kursi zarari (${payAmount} ${receipt.currency})`,
          });
        } else if (exchangeDifference < 0) {
          const exchangeGainAcc = await tx.account.findFirst({
            where: { tenantId, code: '9540' },
          });
          if (!exchangeGainAcc)
            throw new BadRequestException(
              'Valyuta kursi daromad hisobi (9540) topilmadi',
            );
          journalLines.push({
            debitAccountId: supplierAcc.id,
            creditAccountId: exchangeGainAcc.id,
            amount: Math.abs(exchangeDifference),
            description: `Xarid to‘lovi bo‘yicha valyuta kursi daromadi (${payAmount} ${receipt.currency})`,
          });
        }

        await this.journalService.createJournalEntry(
          tenantId,
          {
            entryDate: paymentDate,
            description: `To'lov: ${receipt.docNumber} — ${receipt.counterparty.name}`,
            sourceDocType: 'PurchasePayment',
            sourceDocId: receipt.id,
            lines: journalLines,
          },
          tx,
        );
      }

      // 6. Audit Log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'PurchaseReceipt',
          entityId: id,
          action: 'UPDATE',
          oldValue: {
            paymentStatus: receipt.paymentStatus,
            paidAmount: receipt.paidAmount,
          },
          newValue: {
            paymentStatus: newPaymentStatus,
            paidAmount: newPaidAmount,
          },
        },
      });

      return updatedReceipt;
    });
  }

  async deleteReceipt(tenantId: string, id: string) {
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id, tenantId },
    });

    if (!receipt) {
      throw new NotFoundException('Xarid hujjati topilmadi');
    }

    if (
      receipt.status !== PurchaseDocStatus.DRAFT &&
      receipt.status !== PurchaseDocStatus.CANCELLED
    ) {
      throw new BadRequestException(
        "Faqat qoralama yoki bekor qilingan holatidagi xarid hujjatlarini o'chirish mumkin",
      );
    }

    await this.prisma.purchaseReceipt.delete({
      where: { tenantId, id },
    });

    return {
      success: true,
      message: "Xarid hujjati muvaffaqiyatli o'chirildi",
    };
  }

  // ─── ADDITIONAL EXPENSES & LANDED COST (BY AMOUNT / BY QUANTITY / BY WEIGHT) ─

  async addExpense(tenantId: string, dto: CreatePurchaseExpenseDto) {
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id: dto.receiptId, tenantId },
      include: {
        items: {
          include: { product: true },
        },
        expenses: true,
      },
    });

    if (!receipt) {
      throw new NotFoundException('Xarid hujjati topilmadi');
    }

    const allocationMethod =
      dto.allocationMethod || ExpenseAllocationMethod.BY_AMOUNT;
    await assertTenantOwned(this.prisma, tenantId, {
      counterparty: dto.supplierId,
    });

    return this.prisma.$transaction(async (tx) => {
      // Create expense
      const expense = await tx.purchaseExpense.create({
        data: {
          tenantId,
          receiptId: dto.receiptId,
          expenseType: dto.expenseType,
          supplierId: dto.supplierId || null,
          amount: dto.amount,
          currency: dto.currency,
          allocationMethod: allocationMethod,
          comment: dto.comment || null,
        },
      });

      // Recalculate total additional expenses for this receipt
      const allExpenses = await tx.purchaseExpense.findMany({
        where: { tenantId, receiptId: dto.receiptId },
      });

      const totalExpensesAmount = allExpenses.reduce(
        (sum, e) => sum + Number(e.amount),
        0,
      );
      const subtotalAmount = Number(receipt.subtotalAmount);
      const totalQuantity = receipt.items.reduce(
        (sum, i) => sum + Number(i.quantity),
        0,
      );

      // Total weight for BY_WEIGHT allocation
      const totalWeight = receipt.items.reduce((sum, i) => {
        const unitWeight =
          Number(i.weight) > 0
            ? Number(i.weight)
            : Number(i.product?.weight) || 1;
        return sum + Number(i.quantity) * unitWeight;
      }, 0);

      // Allocate expenses among items
      for (const item of receipt.items) {
        let allocatedForItem = 0;
        const itemQty = Number(item.quantity);
        const itemTotal = Number(item.totalPrice);
        const unitWeight =
          Number(item.weight) > 0
            ? Number(item.weight)
            : Number(item.product?.weight) || 1;
        const itemWeightTotal = itemQty * unitWeight;

        if (
          allocationMethod === ExpenseAllocationMethod.BY_AMOUNT &&
          subtotalAmount > 0
        ) {
          allocatedForItem = (itemTotal / subtotalAmount) * totalExpensesAmount;
        } else if (
          allocationMethod === ExpenseAllocationMethod.BY_QUANTITY &&
          totalQuantity > 0
        ) {
          allocatedForItem = (itemQty / totalQuantity) * totalExpensesAmount;
        } else if (
          allocationMethod === ExpenseAllocationMethod.BY_WEIGHT &&
          totalWeight > 0
        ) {
          allocatedForItem =
            (itemWeightTotal / totalWeight) * totalExpensesAmount;
        } else {
          allocatedForItem = totalExpensesAmount / receipt.items.length;
        }

        const newLandedCost =
          itemQty > 0 ? (itemTotal + allocatedForItem) / itemQty : 0;

        await tx.purchaseReceiptItem.update({
          where: { receipt: { tenantId }, id: item.id },
          data: {
            allocatedExpenses: allocatedForItem,
            landedCost: newLandedCost,
          },
        });

        // Update product batch landed cost if created
        if (receipt.status === PurchaseDocStatus.POSTED) {
          await tx.productBatch.updateMany({
            where: {
              tenantId,
              receiptId: receipt.id,
              productId: item.productId,
            },
            data: { landedCost: newLandedCost },
          });
        }
      }

      // Update total amount on receipt
      const newTotalAmount =
        Number(receipt.subtotalAmount) -
        Number(receipt.discountAmount) +
        Number(receipt.vatAmount) +
        totalExpensesAmount;

      const updatedReceipt = await tx.purchaseReceipt.update({
        where: { tenantId, id: receipt.id },
        data: {
          additionalExpensesTotal: totalExpensesAmount,
          totalAmount: newTotalAmount,
        },
        include: {
          items: { include: { product: true } },
          expenses: { include: { supplier: true } },
        },
      });

      return { expense, receipt: updatedReceipt };
    });
  }

  async findAllExpenses(tenantId: string) {
    return this.prisma.purchaseExpense.findMany({
      where: { tenantId },
      include: {
        receipt: {
          include: { counterparty: true },
        },
        supplier: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── RETURNS TO SUPPLIER ──────────────────────────────────────

  async createReturn(
    tenantId: string,
    userId: string,
    dto: CreatePurchaseReturnDto & { status?: ReturnDocStatus },
  ) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException(
        "Qaytarish hujjatida kamida bitta tovar bo'lishi shart",
      );
    }

    // Products are checked one by one below; a return without a linked
    // receipt takes its counterparty and warehouse only from the request.
    await assertTenantOwned(this.prisma, tenantId, {
      counterparty: dto.counterpartyId,
      warehouse: dto.warehouseId,
    });

    const returnNumber = await this.generateReturnNumber(tenantId);
    const targetStatus =
      (dto.status as ReturnDocStatus) || ReturnDocStatus.POSTED;

    // Validate products and check that SERVICE and BUNDLE are rejected
    for (const item of dto.items) {
      const qty = Number(item.quantity);
      if (item.quantity == null || isNaN(qty) || qty <= 0) {
        throw new BadRequestException(
          "Qaytarish qatorida miqdor (quantity) 0 dan katta bo'lishi shart",
        );
      }
      const unitPrice = Number(item.unitPrice);
      if (item.unitPrice == null || isNaN(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(
          "Qaytarish qatorida narx (unitPrice) 0 yoki undan katta bo'lishi shart",
        );
      }

      const product = await this.prisma.product.findFirst({
        where: { id: item.productId, tenantId },
      });
      if (!product) {
        throw new NotFoundException(`Mahsulot #${item.productId} topilmadi`);
      }
      if (product.type === 'SERVICE' || product.type === 'BUNDLE') {
        throw new BadRequestException(
          `Xizmat (SERVICE) yoki to'plam (BUNDLE) turidagi mahsulotlarni ombordan qaytarish taqiqlanadi. Faqat Tovar (PRODUCT) va Xomashyo (RAW_MATERIAL) qaytarilishi mumkin.`,
        );
      }

      // Check on-hand warehouse stock
      const stockLevel = await this.prisma.stockLevel.findUnique({
        where: {
          tenantId_warehouseId_productId: {
            tenantId,
            warehouseId: dto.warehouseId,
            productId: item.productId,
          },
        },
      });
      const availableStock = stockLevel ? Number(stockLevel.quantity) : 0;
      if (qty > availableStock) {
        throw new BadRequestException(
          `Qaytariladigan miqdor (${qty}) omborda mavjud qoldiqdan (${availableStock}) oshishi mumkin emas`,
        );
      }
    }

    // Validate receipt & items if receiptId is linked
    let receipt: ReceiptForReturn | null = null;
    if (dto.receiptId) {
      receipt = await this.prisma.purchaseReceipt.findFirst({
        where: { id: dto.receiptId, tenantId },
        include: {
          items: { include: { product: true } },
          batches: true,
          returns: true,
        },
      });

      if (!receipt) {
        throw new NotFoundException('Biriktirilgan xarid hujjati topilmadi');
      }

      if (receipt.status !== PurchaseDocStatus.POSTED) {
        throw new BadRequestException(
          "Faqat tasdiqlangan (POSTED) xaridlar bo'yicha qaytarish yaratish mumkin",
        );
      }
      if (
        receipt.counterpartyId !== dto.counterpartyId ||
        receipt.warehouseId !== dto.warehouseId ||
        receipt.currency !== dto.currency
      ) {
        throw new BadRequestException(
          "Qaytarishdagi kontragent, ombor va valyuta asl xarid hujjatiga mos bo'lishi shart",
        );
      }

      const requestedQtyByProduct = new Map<string, number>();
      for (const item of dto.items) {
        requestedQtyByProduct.set(
          item.productId,
          (requestedQtyByProduct.get(item.productId) ?? 0) +
            Number(item.quantity),
        );
      }

      for (const item of dto.items) {
        const receiptItem = receipt.items.find(
          (ri) => ri.productId === item.productId,
        );
        if (!receiptItem) {
          throw new BadRequestException(
            `Tovar #${item.productId} ushbu xarid tarkibida mavjud emas`,
          );
        }

        const unreturnedQty =
          Number(receiptItem.quantity) -
          Number(receiptItem.returnedQuantity || 0);
        if ((requestedQtyByProduct.get(item.productId) ?? 0) > unreturnedQty) {
          throw new BadRequestException(
            `Qaytariladigan miqdor (${item.quantity}) ushbu xariddan qolgan qaytarilmagan miqdordan (${unreturnedQty}) oshishi mumkin emas`,
          );
        }

        const batch = receipt.batches.find(
          (b) => b.productId === item.productId,
        );
        if (
          batch &&
          (requestedQtyByProduct.get(item.productId) ?? 0) >
            Number(batch.remainingQty)
        ) {
          throw new BadRequestException(
            `Qaytariladigan miqdor (${item.quantity}) partiyada qolgan miqdordan (${batch.remainingQty.toString()}) oshishi mumkin emas. Sotib yuborilgan tovarni qaytarish taqiqlanadi.`,
          );
        }
      }
    }

    // The supplier payable from a linked receipt was booked at the receipt's
    // rate, so its return reverses at that rate. A standalone return needs one.
    let exchangeRate: number;
    if (receipt) {
      exchangeRate = requireExchangeRateForCurrency(
        receipt.currency,
        Number(receipt.exchangeRate),
      );
      if (
        dto.exchangeRate !== undefined &&
        Number(dto.exchangeRate) !== exchangeRate
      ) {
        throw new BadRequestException(
          `Xarid hujjatiga bog'langan qaytarish xarid kursida (${exchangeRate}) bo'lishi shart`,
        );
      }
    } else {
      exchangeRate = requireExchangeRateForCurrency(
        dto.currency,
        dto.exchangeRate,
      );
    }

    let totalAmount = 0;
    const preparedItems = dto.items.map((i) => {
      const vatRate = i.vatRate || 0;
      const calculatedVat =
        i.vatAmount !== undefined
          ? Number(i.vatAmount)
          : Number(((i.quantity * i.unitPrice * vatRate) / 100).toFixed(2));
      const lineTotal = Number(
        (i.quantity * i.unitPrice + calculatedVat).toFixed(2),
      );
      totalAmount += lineTotal;

      return {
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        vatRate,
        vatAmount: calculatedVat,
        totalPrice: lineTotal,
      };
    });

    return this.prisma.$transaction(async (tx) => {
      const pReturn = await tx.purchaseReturn.create({
        data: {
          tenantId,
          returnNumber,
          returnDate: dto.returnDate ? new Date(dto.returnDate) : new Date(),
          receiptId: dto.receiptId || null,
          counterpartyId: dto.counterpartyId,
          warehouseId: dto.warehouseId,
          currency: dto.currency,
          exchangeRate,
          actNumber: dto.actNumber || null,
          reason: dto.reason || null,
          comment: dto.comment || null,
          status: targetStatus,
          totalAmount,
          createdById: userId,
          items: {
            create: preparedItems,
          },
        },
        include: {
          counterparty: true,
          warehouse: true,
          receipt: {
            include: { items: { include: { product: true } }, batches: true },
          },
          items: { include: { product: true } },
        },
      });

      // If created directly in POSTED status, execute posting inventory & financial movements
      if (targetStatus === ReturnDocStatus.POSTED) {
        await this.executeReturnPostingInternal(tx, tenantId, userId, pReturn, {
          items: preparedItems,
          warehouseId: dto.warehouseId,
          counterpartyId: dto.counterpartyId,
          receiptId: dto.receiptId,
          receipt,
          returnNumber,
        });
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'PurchaseReturn',
          entityId: pReturn.id,
          action: 'CREATE',
          newValue: { returnNumber, totalAmount, status: targetStatus },
        },
      });

      return pReturn;
    });
  }

  /**
   * Internal reusable posting engine for Purchase Returns (ADR 0009 & ADR 0017)
   */
  private async executeReturnPostingInternal(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    pReturn: PurchaseReturnForPosting,
    fallbackData?: {
      items?: ReturnPostingLine[];
      warehouseId?: string;
      counterpartyId?: string;
      receiptId?: string | null;
      receipt?: ReceiptForReturn | null;
      returnNumber?: string;
    },
  ) {
    let productLandedCostTotal = 0;
    let rawMaterialLandedCostTotal = 0;
    let basePurchaseTotalReduction = 0;
    let totalVatAmount = 0;

    const items =
      Array.isArray(pReturn?.items) && pReturn.items.length > 0
        ? pReturn.items
        : Array.isArray(fallbackData?.items)
          ? fallbackData.items
          : [];
    // Typed as present: FIFO consumption and the settlement ledger reject a
    // missing warehouse or counterparty themselves.
    const warehouseId = (pReturn?.warehouseId ||
      fallbackData?.warehouseId) as string;
    const counterpartyId = (pReturn?.counterpartyId ||
      fallbackData?.counterpartyId) as string;
    const receiptId =
      pReturn?.receiptId !== undefined
        ? pReturn.receiptId
        : fallbackData?.receiptId;
    const receipt = pReturn?.receipt || fallbackData?.receipt;
    // Line prices and VAT are in the return's currency; batch costs and the
    // journal are in UZS.
    const exchangeRate = requireExchangeRateForCurrency(
      pReturn.currency,
      Number(pReturn.exchangeRate),
    );
    const toUzs = (amount: number) =>
      convertAmountToUzs(amount, pReturn.currency, exchangeRate);

    for (const item of items) {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const vatAmount = Number(item.vatAmount || 0);
      const itemType = item.product?.type || 'PRODUCT';

      if (itemType === 'SERVICE' || itemType === 'BUNDLE') {
        throw new BadRequestException(
          `Xizmat (SERVICE) yoki to'plam (BUNDLE) turidagi mahsulotlarni ombordan qaytarish taqiqlanadi.`,
        );
      }

      totalVatAmount += vatAmount;
      basePurchaseTotalReduction += qty * unitPrice + vatAmount;

      // 1. Decrement warehouse stock
      const stockLevel = await tx.stockLevel.findUnique({
        where: {
          tenantId_warehouseId_productId: {
            tenantId,
            warehouseId,
            productId: item.productId,
          },
        },
      });

      if (!stockLevel || Number(stockLevel.quantity) < qty) {
        const avail = stockLevel ? Number(stockLevel.quantity) : 0;
        throw new BadRequestException(
          `Omborda qaytarish uchun yetarli qoldiq mavjud emas (Mavjud: ${avail}, Qaytarilayotgan: ${qty})`,
        );
      }

      await tx.stockLevel.update({
        where: { tenantId, id: stockLevel.id },
        data: { quantity: { decrement: qty } },
      });

      // 2. Batch deduction. Goods leave at the landed cost of the batches
      // actually consumed (UZS per unit). A receipt line's own landedCost is
      // in the receipt's currency, so it is never used as a UZS cost.
      let lineLandedCost: number;

      if (receiptId && receipt) {
        const receiptItem = receipt.items.find(
          (ri) => ri.productId === item.productId,
        );

        if (receiptItem) {
          await tx.purchaseReceiptItem.update({
            where: { receipt: { tenantId }, id: receiptItem.id },
            data: {
              returnedQuantity: { increment: qty },
            },
          });
        }

        // Return the receipt's own goods when they are still in this warehouse.
        const batch = receipt.batches.find(
          (b) =>
            b.productId === item.productId && b.warehouseId === warehouseId,
        );
        const allocation = await consumeFifoBatches(tx, {
          tenantId,
          warehouseId,
          productId: item.productId,
          quantity: qty,
          batchIds: batch ? [batch.id] : undefined,
          // Stored return lines always have an id; prepared lines are only a fallback.
          source: { purchaseReturnItemId: item.id as string },
        });
        lineLandedCost = allocation.totalCost;
      } else {
        // Standalone return: FIFO batch consumption from warehouse
        const allocation = await consumeFifoBatches(tx, {
          tenantId,
          warehouseId,
          productId: item.productId,
          quantity: qty,
          // Stored return lines always have an id; prepared lines are only a fallback.
          source: { purchaseReturnItemId: item.id as string },
        });
        lineLandedCost = allocation.totalCost;
      }

      if (itemType === 'RAW_MATERIAL') {
        rawMaterialLandedCostTotal += lineLandedCost;
      } else {
        productLandedCostTotal += lineLandedCost;
      }
    }

    // 3. Reduce supplier payable in the purchase-return currency.
    await this.settlementService.recordMovement(tx, {
      tenantId,
      counterpartyId,
      currency: pReturn.currency,
      side: CounterpartySettlementSide.SUPPLIER,
      amount: -basePurchaseTotalReduction,
      entryType: 'PURCHASE_RETURN_POSTED',
      effectiveAt: pReturn.returnDate,
      sourceDocType: 'PurchaseReturn',
      sourceDocId: pReturn.id,
      idempotencyKey: `PurchaseReturn:${pReturn.id}:POSTED`,
    });

    // 4. Update main receipt returnStatus if linked
    if (receiptId) {
      const updatedItems = await tx.purchaseReceiptItem.findMany({
        where: { receipt: { tenantId }, receiptId },
      });

      const allFullyReturned = updatedItems.every(
        (ri) => Number(ri.returnedQuantity) >= Number(ri.quantity),
      );
      const anyReturned = updatedItems.some(
        (ri) => Number(ri.returnedQuantity) > 0,
      );
      const returnStatus = allFullyReturned
        ? PurchaseReturnStatus.FULLY_RETURNED
        : anyReturned
          ? PurchaseReturnStatus.PARTIALLY_RETURNED
          : PurchaseReturnStatus.NONE;

      await tx.purchaseReceipt.update({
        where: { tenantId, id: receiptId },
        data: { returnStatus },
      });
    }

    // 5. Automated BHMS/NAS Double-Entry Journal Entries (ADR 0009)
    const supplierAcc = await tx.account.findFirst({
      where: { tenantId, code: '6010' },
    });
    const inventoryAcc = await tx.account.findFirst({
      where: { tenantId, code: '2910' },
    });
    const rawMaterialAcc =
      (await tx.account.findFirst({
        where: { tenantId, code: '1010' },
      })) || inventoryAcc;
    const vatAcc = await tx.account.findFirst({
      where: { tenantId, code: '4410' },
    });
    const lossAcc =
      (await tx.account.findFirst({
        where: { tenantId, code: '9430' },
      })) ||
      (await tx.account.findFirst({
        where: { tenantId, code: '9420' },
      }));

    if (supplierAcc) {
      const journalLines: JournalLineDto[] = [];
      // Everything below is UZS. Inventory leaves at landed cost; the supplier
      // payable falls by the base price; the non-refundable rest is a loss
      // (ADR 0009).
      const productCost = round2(productLandedCostTotal);
      const rawMaterialCost = round2(rawMaterialLandedCostTotal);
      const totalLandedCost = round2(productCost + rawMaterialCost);
      const baseWithoutVat = toUzs(basePurchaseTotalReduction - totalVatAmount);
      const vatInUzs = toUzs(totalVatAmount);
      const varianceLoss = round2(
        Math.max(0, totalLandedCost - baseWithoutVat),
      );
      // Landed cost below the base price (D2): the payable still falls by the
      // base price, and the gap goes to the account the accountant configured
      // in company settings. Not configured -> the return is refused rather
      // than leaving 6010 out of line with the supplier settlement.
      const gainGap = round2(Math.max(0, baseWithoutVat - totalLandedCost));
      const gainAcc =
        gainGap > 0
          ? await this.purchaseReturnGainAccount(tx, tenantId, gainGap)
          : null;
      const fromSupplier = round2(totalLandedCost - varianceLoss);
      const productFromSupplier =
        totalLandedCost > 0
          ? round2((fromSupplier * productCost) / totalLandedCost)
          : 0;
      const rawMaterialFromSupplier = round2(
        fromSupplier - productFromSupplier,
      );
      const productLoss = round2(productCost - productFromSupplier);
      const rawMaterialLoss = round2(rawMaterialCost - rawMaterialFromSupplier);

      if (varianceLoss > 0 && !lossAcc) {
        throw new BadRequestException(
          'Qaytarish zarari uchun hisob (9430 yoki 9420) topilmadi',
        );
      }

      const goods = [
        {
          account: inventoryAcc,
          fromSupplier: productFromSupplier,
          loss: productLoss,
          label: 'tovarlar',
        },
        {
          account: rawMaterialAcc,
          fromSupplier: rawMaterialFromSupplier,
          loss: rawMaterialLoss,
          label: 'xomashyolar',
        },
      ];
      for (const { account, fromSupplier: amount, label } of goods) {
        if (amount > 0 && account) {
          journalLines.push({
            debitAccountId: supplierAcc.id,
            creditAccountId: account.id,
            amount,
            description: `Qaytarilgan ${label} hisobdan chiqarilishi (№ ${pReturn.returnNumber})`,
          });
        }
      }

      if (gainAcc) {
        journalLines.push({
          debitAccountId: supplierAcc.id,
          creditAccountId: gainAcc.id,
          amount: gainGap,
          description: `Qaytarishda tannarx asosiy narxdan past: farq (№ ${pReturn.returnNumber})`,
        });
      }

      if (vatInUzs > 0 && vatAcc) {
        journalLines.push({
          debitAccountId: supplierAcc.id,
          creditAccountId: vatAcc.id,
          amount: vatInUzs,
          description: `Qaytarilgan tovarlar bo‘yicha QQS kamayishi (№ ${pReturn.returnNumber})`,
        });
      }

      for (const { account, loss } of goods) {
        if (loss > 0 && lossAcc && account) {
          journalLines.push({
            debitAccountId: lossAcc.id,
            creditAccountId: account.id,
            amount: loss,
            description: `Qaytarish bo‘yicha taqsimlangan xarajatlar zarari (Landed Cost Return Variance, № ${pReturn.returnNumber})`,
          });
        }
      }

      if (journalLines.length > 0) {
        await this.journalService.createJournalEntry(
          tenantId,
          {
            entryDate: pReturn.returnDate,
            description: `Yetkazib beruvchiga qaytarish № ${pReturn.returnNumber} (${pReturn.counterparty?.name || ''})`,
            sourceDocType: 'PurchaseReturn',
            sourceDocId: pReturn.id,
            lines: journalLines,
          },
          tx,
        );
      }
    }
  }

  /**
   * D2: the account that takes the gap when returned goods leave at a
   * landed cost below their base price. Chosen by the accountant in
   * company settings (accounting.purchaseReturnGainAccountCode); there is
   * no default, so a missing setting refuses the return with a clear error.
   */
  private async purchaseReturnGainAccount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    gap: number,
  ) {
    const company = await tx.company.findFirst({
      where: { id: tenantId },
      select: { settings: true },
    });
    const code = accountingSettings(
      company?.settings,
    ).purchaseReturnGainAccountCode;
    if (!code) {
      throw new BadRequestException(
        `Qaytarilayotgan tovar tannarxi asosiy narxdan ${formatMoney(gap, 'UZS')} past. Bu farq uchun hisob sozlanmagan: ` +
          `kompaniya sozlamalarida accounting.${PURCHASE_RETURN_GAIN_ACCOUNT_SETTING} ni belgilang (buxgalter tanlaydi). / ` +
          `Себестоимость возвращаемого товара ниже базовой цены на ${formatMoney(gap, 'UZS')}. Счёт для этой разницы не настроен: ` +
          `укажите accounting.${PURCHASE_RETURN_GAIN_ACCOUNT_SETTING} в настройках компании (выбирает бухгалтер).`,
      );
    }
    const account = await tx.account.findFirst({ where: { tenantId, code } });
    if (!account) {
      throw new BadRequestException(
        `Sozlamadagi ${code} hisobi hisoblar rejasida topilmadi. / Счёт ${code} из настроек не найден в плане счетов.`,
      );
    }
    return account;
  }

  async approveReturn(tenantId: string, userId: string, returnId: string) {
    const pReturn = await this.prisma.purchaseReturn.findFirst({
      where: { id: returnId, tenantId },
      include: {
        counterparty: true,
        warehouse: true,
        receipt: {
          include: {
            items: { include: { product: true } },
            batches: true,
          },
        },
        items: { include: { product: true } },
      },
    });

    if (!pReturn) {
      throw new NotFoundException('Qaytarish hujjati topilmadi');
    }

    if (pReturn.status === ReturnDocStatus.POSTED) {
      throw new BadRequestException('Ushbu hujjat allaqachon tasdiqlangan');
    }

    if (pReturn.status === ReturnDocStatus.CANCELLED) {
      throw new BadRequestException(
        "Bekor qilingan hujjatni tasdiqlab bo'lmaydi",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.executeReturnPostingInternal(tx, tenantId, userId, pReturn);

      const updated = await tx.purchaseReturn.update({
        where: { tenantId, id: returnId },
        data: { status: ReturnDocStatus.POSTED },
        include: {
          counterparty: true,
          warehouse: true,
          receipt: true,
          items: { include: { product: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'PurchaseReturn',
          entityId: returnId,
          action: 'UPDATE',
          oldValue: { status: pReturn.status },
          newValue: { status: ReturnDocStatus.POSTED },
        },
      });

      return updated;
    });
  }

  async getReturnById(tenantId: string, returnId: string) {
    const pReturn = await this.prisma.purchaseReturn.findFirst({
      where: { id: returnId, tenantId },
      include: {
        counterparty: true,
        warehouse: true,
        receipt: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: { include: { product: true } },
      },
    });

    if (!pReturn) {
      throw new NotFoundException('Qaytarish hujjati topilmadi');
    }

    return pReturn;
  }

  async cancelReturn(tenantId: string, userId: string, returnId: string) {
    const pReturn = await this.prisma.purchaseReturn.findFirst({
      where: { id: returnId, tenantId },
      include: {
        items: { include: { product: true } },
        receipt: { include: { items: true, batches: true } },
      },
    });

    if (!pReturn) {
      throw new NotFoundException('Qaytarish hujjati topilmadi');
    }

    if (pReturn.status === ReturnDocStatus.CANCELLED) {
      throw new BadRequestException('Ushbu hujjat allaqachon bekor qilingan');
    }

    // Safety guardrail: check for linked cash refund transactions in Finance
    const linkedPayment = await this.prisma.financeTransaction.findFirst({
      where: {
        tenantId,
        counterpartyId: pReturn.counterpartyId,
        direction: 'INCOME',
        comment: { contains: pReturn.returnNumber },
      },
    });
    if (linkedPayment) {
      throw new BadRequestException(
        `Ushbu qaytarish hujjati bo'yicha pul qaytishi (moliya kirimi) mavjud. Avval ushbu to'lovni o'chiring.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // D4: nothing dated in a closed accounting period may change.
      if (pReturn.status === ReturnDocStatus.POSTED) {
        await assertPeriodOpen(tx, tenantId, pReturn.returnDate, 'cancel');
      }
      // If the document was POSTED, reverse stock, batch, debt, journal entries and receipt items
      if (pReturn.status === ReturnDocStatus.POSTED) {
        let basePurchaseTotal = 0;

        for (const item of pReturn.items) {
          const qty = Number(item.quantity);
          basePurchaseTotal += Number(item.totalPrice);

          // 1. Re-increment warehouse stock
          const stockLevel = await tx.stockLevel.findUnique({
            where: {
              tenantId_warehouseId_productId: {
                tenantId,
                warehouseId: pReturn.warehouseId,
                productId: item.productId,
              },
            },
          });

          if (stockLevel) {
            await tx.stockLevel.update({
              where: { tenantId, id: stockLevel.id },
              data: { quantity: { increment: qty } },
            });
          }

          // 2. Decrement PurchaseReceiptItem returnedQuantity
          if (pReturn.receipt) {
            const receiptItem = pReturn.receipt.items.find(
              (ri) => ri.productId === item.productId,
            );
            if (receiptItem) {
              await tx.purchaseReceiptItem.update({
                where: { receipt: { tenantId }, id: receiptItem.id },
                data: {
                  returnedQuantity: {
                    decrement: Math.min(
                      qty,
                      Number(receiptItem.returnedQuantity),
                    ),
                  },
                },
              });
            }
          }

          // 3. Put back exactly the batches this return line consumed.
          await restoreBatchConsumptions(tx, tenantId, {
            purchaseReturnItemId: item.id,
          });
        }

        // 4. Reverse the supplier-balance effect without deleting history.
        await this.settlementService.recordMovement(tx, {
          tenantId,
          counterpartyId: pReturn.counterpartyId,
          currency: pReturn.currency,
          side: CounterpartySettlementSide.SUPPLIER,
          amount: basePurchaseTotal,
          entryType: 'PURCHASE_RETURN_CANCELLED',
          effectiveAt: pReturn.returnDate,
          sourceDocType: 'PurchaseReturn',
          sourceDocId: pReturn.id,
          idempotencyKey: `PurchaseReturn:${pReturn.id}:CANCELLED`,
        });

        // 4. Update receipt returnStatus
        if (pReturn.receiptId) {
          const updatedItems = await tx.purchaseReceiptItem.findMany({
            where: { receipt: { tenantId }, receiptId: pReturn.receiptId },
          });

          const totalReturned = updatedItems.reduce(
            (sum, ri) => sum + Number(ri.returnedQuantity),
            0,
          );
          const returnStatus =
            totalReturned === 0
              ? PurchaseReturnStatus.NONE
              : PurchaseReturnStatus.PARTIALLY_RETURNED;

          await tx.purchaseReceipt.update({
            where: { tenantId, id: pReturn.receiptId },
            data: { returnStatus },
          });
        }

        // 5. Delete journal entries created for this return
        await this.journalService.deleteEntriesForSource(
          tx,
          tenantId,
          'PurchaseReturn',
          returnId,
          'cancel',
        );
      }

      // Update status to CANCELLED
      const updatedReturn = await tx.purchaseReturn.update({
        where: { tenantId, id: returnId },
        data: { status: ReturnDocStatus.CANCELLED },
        include: { items: true, counterparty: true, warehouse: true },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'PurchaseReturn',
          entityId: returnId,
          action: 'UPDATE',
          newValue: { status: ReturnDocStatus.CANCELLED },
        },
      });

      return updatedReturn;
    });
  }

  async deleteReturn(tenantId: string, id: string) {
    const pReturn = await this.prisma.purchaseReturn.findFirst({
      where: { id, tenantId },
    });

    if (!pReturn) {
      throw new NotFoundException('Qaytarish hujjati topilmadi');
    }

    if (
      pReturn.status !== ReturnDocStatus.DRAFT &&
      pReturn.status !== ReturnDocStatus.CANCELLED
    ) {
      throw new BadRequestException(
        "Faqat 'Qoralama' yoki 'Bekor qilingan' holatidagi qaytarish hujjatlarini o'chirish mumkin",
      );
    }

    await this.prisma.purchaseReturnItem.deleteMany({
      where: { return: { tenantId }, returnId: id },
    });

    await this.prisma.purchaseReturn.delete({
      where: { tenantId, id },
    });

    return {
      success: true,
      message: "Qaytarish hujjati muvaffaqiyatli o'chirildi",
    };
  }

  async findAllReturns(
    tenantId: string,
    filters?: {
      search?: string;
      supplierId?: string;
      warehouseId?: string;
      status?: ReturnDocStatus;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const where: Prisma.PurchaseReturnWhereInput = { tenantId };

    if (filters?.supplierId) {
      where.counterpartyId = filters.supplierId;
    }

    if (filters?.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      const returnDate: Prisma.DateTimeFilter = {};
      if (filters.startDate) {
        returnDate.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        returnDate.lte = end;
      }
      where.returnDate = returnDate;
    }

    if (filters?.search) {
      const search = filters.search.trim();
      where.OR = [
        { returnNumber: { contains: search, mode: 'insensitive' } },
        { actNumber: { contains: search, mode: 'insensitive' } },
        { comment: { contains: search, mode: 'insensitive' } },
        { counterparty: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.purchaseReturn.findMany({
      where,
      include: {
        counterparty: true,
        warehouse: true,
        receipt: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: { include: { product: true } },
      },
      orderBy: { returnDate: 'desc' },
    });
  }

  // ─── SUPPLIER PROFILE & STATS ─────────────────────────────────

  async getSupplierProfile(tenantId: string, supplierId: string) {
    const supplier = await this.prisma.counterparty.findFirst({
      where: { id: supplierId, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException('Yetkazib beruvchi topilmadi');
    }

    const receipts = await this.prisma.purchaseReceipt.findMany({
      where: { tenantId, counterpartyId: supplierId },
      include: { warehouse: true, items: { include: { product: true } } },
      orderBy: { docDate: 'desc' },
    });

    const returns = await this.prisma.purchaseReturn.findMany({
      where: { tenantId, counterpartyId: supplierId },
      include: { warehouse: true, items: { include: { product: true } } },
      orderBy: { returnDate: 'desc' },
    });

    const payments = await this.prisma.financeTransaction.findMany({
      where: {
        tenantId,
        counterpartyId: supplierId,
        direction: 'EXPENSE',
      },
      include: { account: true, transactionType: true },
      orderBy: { transactionDate: 'desc' },
    });

    const totalPurchased = receipts.reduce(
      (sum, r) => sum + Number(r.totalAmount),
      0,
    );
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalReturned = returns.reduce(
      (sum, ret) => sum + Number(ret.totalAmount),
      0,
    );
    const balances = await this.prisma.counterpartyBalance.findMany({
      where: { tenantId, counterpartyId: supplierId },
      select: { currency: true, customerDebt: true, supplierDebt: true },
      orderBy: { currency: 'asc' },
    });
    const balancesByCurrency = balances.map((balance) => ({
      currency: balance.currency,
      customerDebt: Number(balance.customerDebt),
      supplierDebt: Number(balance.supplierDebt),
      netBalance: Number(balance.customerDebt) - Number(balance.supplierDebt),
    }));
    const supplierAdvancesByCurrency = balancesByCurrency
      .filter((balance) => balance.supplierDebt < 0)
      .map((balance) => ({
        currency: balance.currency,
        amount: Math.abs(balance.supplierDebt),
      }));
    const {
      debtBalance: _legacyDebtBalance,
      customerDebt: _legacyCustomerDebt,
      supplierDebt: _legacySupplierDebt,
      ...supplierData
    } = supplier;

    return {
      supplier: { ...supplierData, balancesByCurrency },
      metrics: {
        totalPurchased,
        totalPaid,
        totalReturned,
        balancesByCurrency,
        supplierAdvancesByCurrency,
      },
      receipts,
      returns,
      payments,
    };
  }

  async getSummaryStats(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyReceipts = await this.prisma.purchaseReceipt.findMany({
      where: {
        tenantId,
        docDate: { gte: startOfMonth },
        status: PurchaseDocStatus.POSTED,
      },
      select: { totalAmount: true, currency: true, exchangeRate: true },
    });

    const purchasesByCurrMap: Record<string, number> = {};
    let monthlyPurchasesTotal = 0;
    for (const r of monthlyReceipts) {
      const amt = Number(r.totalAmount || 0);
      const curr = r.currency;
      purchasesByCurrMap[curr] = (purchasesByCurrMap[curr] || 0) + amt;
      monthlyPurchasesTotal += amt;
    }
    const monthlyPurchasesByCurrency = Object.entries(purchasesByCurrMap).map(
      ([currency, amount]) => ({
        currency,
        amount,
      }),
    );

    const settlementBalances = await this.prisma.counterpartyBalance.findMany({
      where: { tenantId },
      select: { counterpartyId: true, currency: true, supplierDebt: true },
    });
    const debtByCurrMap: Record<string, number> = {};
    const advancesByCurrMap: Record<string, number> = {};
    const suppliersWithDebt = new Set<string>();
    for (const balance of settlementBalances) {
      const supplierDebt = Number(balance.supplierDebt);
      if (supplierDebt > 0) {
        debtByCurrMap[balance.currency] =
          (debtByCurrMap[balance.currency] || 0) + supplierDebt;
        suppliersWithDebt.add(balance.counterpartyId);
      } else if (supplierDebt < 0) {
        advancesByCurrMap[balance.currency] =
          (advancesByCurrMap[balance.currency] || 0) + Math.abs(supplierDebt);
      }
    }

    const totalSupplierDebtByCurrency = Object.entries(debtByCurrMap).map(
      ([currency, amount]) => ({
        currency,
        amount,
      }),
    );
    const supplierAdvancesByCurrency = Object.entries(advancesByCurrMap).map(
      ([currency, amount]) => ({ currency, amount }),
    );
    const totalSupplierDebt =
      totalSupplierDebtByCurrency.length === 1
        ? totalSupplierDebtByCurrency[0].amount
        : 0;
    const suppliersWithDebtCount = suppliersWithDebt.size;

    const monthlyReturns = await this.prisma.purchaseReturn.findMany({
      where: {
        tenantId,
        returnDate: { gte: startOfMonth },
      },
      select: { totalAmount: true, currency: true },
    });

    const returnsByCurrMap: Record<string, number> = {};
    let monthlyReturnsTotal = 0;
    for (const ret of monthlyReturns) {
      const amt = Number(ret.totalAmount || 0);
      const curr = ret.currency;
      returnsByCurrMap[curr] = (returnsByCurrMap[curr] || 0) + amt;
      monthlyReturnsTotal += amt;
    }
    const monthlyReturnsByCurrency = Object.entries(returnsByCurrMap).map(
      ([currency, amount]) => ({
        currency,
        amount,
      }),
    );

    const activeSuppliers = await this.prisma.counterparty.count({
      where: {
        tenantId,
        type: { in: ['SUPPLIER', 'BOTH'] },
      },
    });

    return {
      monthlyPurchasesTotal,
      monthlyPurchasesCount: monthlyReceipts.length,
      totalSupplierDebt,
      suppliersWithDebtCount,
      monthlyReturnsTotal,
      monthlyReturnsCount: monthlyReturns.length,
      activeSuppliersCount: activeSuppliers,
      currency:
        monthlyPurchasesByCurrency.length === 1
          ? monthlyPurchasesByCurrency[0].currency
          : 'UZS',
      monthlyPurchasesByCurrency,
      totalSupplierDebtByCurrency,
      supplierAdvancesByCurrency,
      monthlyReturnsByCurrency,
    };
  }
}

/** Round a UZS amount to tiyin. */
function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}
