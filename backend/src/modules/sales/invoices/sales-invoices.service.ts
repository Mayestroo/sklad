import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { CreateSalesInvoiceDto } from '../dto/create-sales-invoice.dto';
import { FilterSalesInvoicesDto } from '../dto/filter-sales-invoices.dto';
import { CreateSalesReturnDto } from '../dto/create-sales-return.dto';
import {
  Prisma,
  CounterpartySettlementSide,
  SettlementAllocationTarget,
  SalesDocStatus,
  SalesPaymentStatus,
  SalesReturnStatus,
  SalesReturnDocStatus,
} from '@prisma/client';
import { generateDocumentSequence } from '../../../common/utils/document-sequence.util';
import { SUPPORTED_CURRENCIES } from '../../../common/validators/currency.validator';
import { CounterpartySettlementService } from '../../settlements/counterparty-settlement.service';
import {
  calculateSalesDocumentTotals,
  calculateSalesLineAmounts,
  grossProfitInUzs,
} from '../sales-calculations';

@Injectable()
export class SalesInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: CounterpartySettlementService,
  ) {}

  // ─── NUMBER GENERATORS ─────────────────────────────────────────

  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    return generateDocumentSequence('INV', (prefix) =>
      this.prisma.salesInvoice.count({
        where: { tenantId, invoiceNumber: { startsWith: prefix } },
      }),
    );
  }

  private async generateReturnNumber(tenantId: string): Promise<string> {
    return generateDocumentSequence('SRET', (prefix) =>
      this.prisma.salesReturn.count({
        where: { tenantId, returnNumber: { startsWith: prefix } },
      }),
    );
  }

  // ─── INVOICES LIST & DETAIL ────────────────────────────────────

  async findAll(tenantId: string, filters: FilterSalesInvoicesDto) {
    const {
      search,
      counterpartyId,
      warehouseId,
      status,
      paymentStatus,
      returnStatus,
      currency,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
    } = filters;

    const where: Prisma.SalesInvoiceWhereInput = { tenantId };

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { counterparty: { name: { contains: search, mode: 'insensitive' } } },
        { comment: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (counterpartyId) where.counterpartyId = counterpartyId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status as SalesDocStatus;
    if (paymentStatus)
      where.paymentStatus = paymentStatus as SalesPaymentStatus;
    if (returnStatus) where.returnStatus = returnStatus as SalesReturnStatus;
    if (currency) where.currency = currency;
    if (dateFrom || dateTo) {
      where.invoiceDate = {};
      if (dateFrom) where.invoiceDate.gte = new Date(dateFrom);
      if (dateTo) where.invoiceDate.lte = new Date(dateTo);
    }
    if (minAmount !== undefined || maxAmount !== undefined) {
      where.totalAmount = {};
      if (minAmount !== undefined) where.totalAmount.gte = minAmount;
      if (maxAmount !== undefined) where.totalAmount.lte = maxAmount;
    }

    return this.prisma.salesInvoice.findMany({
      where,
      include: {
        counterparty: true,
        priceList: true,
        warehouse: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        postedBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: true } },
        returns: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, tenantId },
      include: {
        counterparty: true,
        priceList: true,
        warehouse: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        postedBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: true } },
        payments: true,
        returns: { include: { items: { include: { product: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException('Sotuv hujjati topilmadi');
    return invoice;
  }

  // ─── INVOICE CRUD & DRAFT CREATION ────────────────────────────

  async createInvoice(
    tenantId: string,
    userId: string,
    dto: CreateSalesInvoiceDto,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException(
        "Sotuv hujjatida kamida bitta tovar bo'lishi shart",
      );
    }

    if (!dto.currency || !SUPPORTED_CURRENCIES.includes(dto.currency as any)) {
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
          "Hujjat qatorida miqdor (quantity) 0 dan katta bo'lishi shart",
        );
      }
      const unitPrice = Number(item.unitPrice);
      if (item.unitPrice == null || isNaN(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(
          "Hujjat qatorida narx (unitPrice) 0 yoki undan katta bo'lishi shart",
        );
      }
      if (
        item.discount != null &&
        (isNaN(Number(item.discount)) || Number(item.discount) < 0 || Number(item.discount) > 100)
      ) {
        throw new BadRequestException(
          'Chegirma foizi 0 va 100 orasida bo‘lishi shart',
        );
      }
    }

    const invoiceNumber = await this.generateInvoiceNumber(tenantId);

    const additionalChargeAmount = Number(dto.additionalChargeAmount ?? 0);
    const additionalChargeVatRate = Number(dto.additionalChargeVatRate ?? 12);
    let totals: ReturnType<typeof calculateSalesDocumentTotals>;
    try {
      totals = calculateSalesDocumentTotals(
        dto.items.map((item) => ({
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discountPercent: Number(item.discount ?? 0),
          vatRate: Number(item.vatRate ?? 0),
        })),
        additionalChargeAmount,
        additionalChargeVatRate,
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Sotuv summalarini hisoblab bo‘lmadi');
    }

    const preparedItems = dto.items.map((item) => {
      const amounts = calculateSalesLineAmounts({
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountPercent: Number(item.discount ?? 0),
        vatRate: Number(item.vatRate ?? 0),
      });
        return {
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount ?? 0),
        vatRate: Number(item.vatRate ?? 0),
        vatAmount: amounts.vatAmount,
        totalPrice: amounts.totalAmount,
        unitCogs: 0,
        lineCogs: 0,
        lineGrossProfit: 0,
        isBelowCost: false,
      };
    });

    const invoice = await this.prisma.salesInvoice.create({
      data: {
        tenantId,
        invoiceNumber,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
        counterpartyId: dto.counterpartyId,
        warehouseId: dto.warehouseId,
        currency: dto.currency,
        exchangeRate,
        contractNumber: dto.contractNumber || null,
        contractDate: dto.contractDate ? new Date(dto.contractDate) : null,
        paymentTerms: dto.paymentTerms || null,
        comment: dto.comment || null,
        priceListId: dto.priceListId || null,
        status: SalesDocStatus.DRAFT,
        paymentStatus: SalesPaymentStatus.UNPAID,
        returnStatus: SalesReturnStatus.NONE,
        subtotalAmount: totals.subtotalAmount,
        discountAmount: totals.discountAmount,
        vatAmount: totals.vatAmount,
        additionalChargeAmount: totals.additionalChargeAmount,
        additionalChargeVatRate,
        additionalChargeVatAmount: totals.additionalChargeVatAmount,
        totalAmount: totals.totalAmount,
        paidAmount: 0,
        totalCogs: 0,
        grossProfit: 0,
        createdById: userId,
        items: { create: preparedItems },
      },
      include: {
        counterparty: true,
        priceList: true,
        warehouse: true,
        items: { include: { product: true } },
      },
    });

    if (dto.postImmediately) {
      return this.postInvoice(tenantId, userId, invoice.id);
    }
    return invoice;
  }

  async updateInvoice(tenantId: string, userId: string, id: string, dto: CreateSalesInvoiceDto) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!invoice) throw new NotFoundException('Sotuv hujjati topilmadi');
    if (invoice.status !== SalesDocStatus.DRAFT) {
      throw new BadRequestException('Faqat qoralama sotuv hujjatini tahrirlash mumkin');
    }
    if (!dto.items?.length) {
      throw new BadRequestException('Sotuv hujjatida kamida bitta tovar bo‘lishi shart');
    }
    if (!dto.currency || !SUPPORTED_CURRENCIES.includes(dto.currency as any)) {
      throw new BadRequestException('Sotuv hujjati uchun USD yoki UZS valyutasini tanlang');
    }

    let exchangeRate = 1;
    if (dto.currency !== 'UZS') {
      if (dto.exchangeRate == null || !Number.isFinite(Number(dto.exchangeRate)) || Number(dto.exchangeRate) <= 0) {
        throw new BadRequestException('Xorijiy valyuta uchun 0 dan katta kursni kiriting');
      }
      exchangeRate = Number(dto.exchangeRate);
    }

    for (const item of dto.items) {
      if (item.quantity == null || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
        throw new BadRequestException('Hujjat qatorida miqdor 0 dan katta bo‘lishi shart');
      }
      if (item.unitPrice == null || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) {
        throw new BadRequestException('Hujjat qatorida narx 0 yoki undan katta bo‘lishi shart');
      }
      if (Number(item.discount ?? 0) < 0 || Number(item.discount ?? 0) > 100) {
        throw new BadRequestException('Chegirma foizi 0 va 100 orasida bo‘lishi shart');
      }
      if (Number(item.vatRate ?? 0) < 0 || Number(item.vatRate ?? 0) > 100) {
        throw new BadRequestException('QQS stavkasi 0 va 100 orasida bo‘lishi shart');
      }
    }

    let totals: ReturnType<typeof calculateSalesDocumentTotals>;
    const additionalChargeAmount = Number(dto.additionalChargeAmount ?? 0);
    const additionalChargeVatRate = Number(dto.additionalChargeVatRate ?? 12);
    try {
      totals = calculateSalesDocumentTotals(
        dto.items.map((item) => ({
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discountPercent: Number(item.discount ?? 0),
          vatRate: Number(item.vatRate ?? 0),
        })),
        additionalChargeAmount,
        additionalChargeVatRate,
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Sotuv summalarini hisoblab bo‘lmadi');
    }
    const preparedItems = dto.items.map((item) => {
      const amounts = calculateSalesLineAmounts({
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountPercent: Number(item.discount ?? 0),
        vatRate: Number(item.vatRate ?? 0),
      });
      return {
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount ?? 0),
        vatRate: Number(item.vatRate ?? 0),
        vatAmount: amounts.vatAmount,
        totalPrice: amounts.totalAmount,
        unitCogs: 0,
        lineCogs: 0,
        lineGrossProfit: 0,
        isBelowCost: false,
      };
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.salesInvoice.update({
        where: { id },
        data: {
          counterpartyId: dto.counterpartyId,
          warehouseId: dto.warehouseId,
          invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : invoice.invoiceDate,
          currency: dto.currency,
          exchangeRate,
          contractNumber: dto.contractNumber || null,
          contractDate: dto.contractDate ? new Date(dto.contractDate) : null,
          paymentTerms: dto.paymentTerms || null,
          comment: dto.comment || null,
          priceListId: dto.priceListId || null,
          subtotalAmount: totals.subtotalAmount,
          discountAmount: totals.discountAmount,
          vatAmount: totals.vatAmount,
          additionalChargeAmount: totals.additionalChargeAmount,
          additionalChargeVatRate,
          additionalChargeVatAmount: totals.additionalChargeVatAmount,
          totalAmount: totals.totalAmount,
          items: {
            deleteMany: {},
            create: preparedItems,
          },
        },
        include: {
          counterparty: true,
          warehouse: true,
          items: { include: { product: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'SalesInvoice',
          entityId: id,
          action: 'UPDATE',
          oldValue: { status: invoice.status, totalAmount: Number(invoice.totalAmount) },
          newValue: { status: result.status, totalAmount: totals.totalAmount },
        },
      });
      return result;
    });

    if (dto.postImmediately) return this.postInvoice(tenantId, userId, id);
    return updated;
  }

  // ─── POST INVOICE (FIFO COGS + STOCK DEDUCTION + ACCOUNTING) ──

  async postInvoice(tenantId: string, userId: string, id: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { product: true } },
        counterparty: true,
      },
    });

    if (!invoice) throw new NotFoundException('Sotuv hujjati topilmadi');
    if (invoice.status !== SalesDocStatus.DRAFT) {
      throw new BadRequestException(
        'Hujjat allaqachon tasdiqlangan yoki bekor qilingan',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let totalCogs = 0;
      const ledgerRate = invoice.currency === 'UZS' ? 1 : Number(invoice.exchangeRate);
      if (!Number.isFinite(ledgerRate) || ledgerRate <= 0) {
        throw new BadRequestException(`Sotuv hujjati uchun valyuta kursi noto‘g‘ri: ${invoice.currency}`);
      }
      const updatedItemData: Array<{
        id: string;
        unitCogs: number;
        lineCogs: number;
        lineGrossProfit: number;
        isBelowCost: boolean;
      }> = [];

      // 1. For each item: check stock, FIFO COGS calculation, stock deduction
      for (const item of invoice.items) {
        const qty = Number(item.quantity);

        // Check stock level and free stock (physical minus reserved)
        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: invoice.warehouseId,
              productId: item.productId,
            },
          },
        });

        const physicalQty = stockLevel ? Number(stockLevel.quantity) : 0;
        const reservedQty = stockLevel ? Number(stockLevel.reservedQuantity || 0) : 0;
        const freeQty = Math.max(0, physicalQty - reservedQty);

        // If not from a sales order (direct sale), must not eat into reserved stock
        const availableQty = invoice.salesOrderId ? physicalQty : freeQty;

        if (availableQty < qty) {
          const prodName = (item.product.name as any)?.uz || item.product.name;
          if (!invoice.salesOrderId && reservedQty > 0) {
            throw new BadRequestException(
              `"${prodName}" uchun erkin qoldiq yetarli emas. Jami: ${physicalQty}, Band qilingan (rezerv): ${reservedQty}, Erkin: ${freeQty}, Talab qilingan: ${qty}`,
            );
          }
          throw new BadRequestException(
            `"${prodName}" uchun omborda yetarli miqdor yo'q. Mavjud: ${availableQty}, kerakli: ${qty}`,
          );
        }

        // FIFO: consume batches oldest first
        const batches = await tx.productBatch.findMany({
          where: {
            tenantId,
            warehouseId: invoice.warehouseId,
            productId: item.productId,
            remainingQty: { gt: 0 },
          },
          orderBy: { createdAt: 'asc' },
        });

        let remainingToConsume = qty;
        let totalItemCogs = 0;

        for (const batch of batches) {
          if (remainingToConsume <= 0) break;

          const batchAvail = Number(batch.remainingQty);
          const consumed = Math.min(batchAvail, remainingToConsume);
          const batchCostPerUnit =
            Number(batch.landedCost) > 0
              ? Number(batch.landedCost)
              : Number(batch.purchasePrice);

          totalItemCogs += consumed * batchCostPerUnit;
          remainingToConsume -= consumed;

          await tx.productBatch.update({
            where: { id: batch.id },
            data: { remainingQty: { decrement: consumed } },
          });

          await tx.batchConsumption.create({
            data: {
              tenantId,
              salesInvoiceItemId: item.id,
              batchId: batch.id,
              quantity: consumed,
              unitCost: batchCostPerUnit,
            },
          });
        }

        // If no batches found (no purchase history), fallback to product costPrice
        if (batches.length === 0 || remainingToConsume > 0) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });
          const fallbackCost = Number(product?.costPrice || 0) * Number(product?.costPriceExchangeRate || 1);
          totalItemCogs += remainingToConsume * fallbackCost;
        }

        const unitCogs = qty > 0 ? totalItemCogs / qty : 0;
        const lineCogs = totalItemCogs;
        const lineTotal = Number(item.totalPrice);
        const lineVat = Number(item.vatAmount || 0);
        const lineNetRevenue = lineTotal - lineVat;
        const lineGrossProfit = grossProfitInUzs(
          lineNetRevenue,
          invoice.currency,
          ledgerRate,
          lineCogs,
        );
        const discountedUnitPrice = Number(item.unitPrice) * (1 - Number(item.discount || 0) / 100);
        const isBelowCost = discountedUnitPrice * ledgerRate < unitCogs;

        totalCogs += lineCogs;

        updatedItemData.push({
          id: item.id,
          unitCogs,
          lineCogs,
          lineGrossProfit,
          isBelowCost,
        });

        // Deduct stock
        await tx.stockLevel.update({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: invoice.warehouseId,
              productId: item.productId,
            },
          },
          data: { quantity: { decrement: qty } },
        });
      }

      // 2. Update each item with COGS data
      for (const itemUpdate of updatedItemData) {
        await tx.salesInvoiceItem.update({
          where: { id: itemUpdate.id },
          data: {
            unitCogs: itemUpdate.unitCogs,
            lineCogs: itemUpdate.lineCogs,
            lineGrossProfit: itemUpdate.lineGrossProfit,
            isBelowCost: itemUpdate.isBelowCost,
          },
        });
      }

      const netRevenueUzs = (Number(invoice.totalAmount) - Number(invoice.vatAmount)) * ledgerRate;
      const grossProfit = grossProfitInUzs(
        Number(invoice.totalAmount) - Number(invoice.vatAmount),
        invoice.currency,
        ledgerRate,
        totalCogs,
      );

      // 3. Accrue the receivable in the shared native-currency settlement ledger.
      await this.settlementService.recordMovement(tx, {
        tenantId,
        counterpartyId: invoice.counterpartyId,
        currency: invoice.currency,
        side: CounterpartySettlementSide.CUSTOMER,
        amount: Number(invoice.totalAmount),
        entryType: 'SALES_INVOICE_POSTED',
        effectiveAt: invoice.invoiceDate,
        sourceDocType: 'SalesInvoice',
        sourceDocId: invoice.id,
        idempotencyKey: `SalesInvoice:${invoice.id}:POSTED:${invoice.updatedAt.toISOString()}`,
      });

      // 4. NAS / BHMS Accounting Journal Entries
      const entryCount = await tx.journalEntry.count({ where: { tenantId } });
      const entryNumber = `JE-${new Date().getFullYear()}-${(entryCount + 1).toString().padStart(5, '0')}`;

      const revenueAcc = await tx.account.findFirst({
        where: { tenantId, code: '9010' },
      });
      const receivableAcc = await tx.account.findFirst({
        where: { tenantId, code: '4010' },
      });
      const vatAcc = await tx.account.findFirst({
        where: { tenantId, code: '6410' },
      });
      const cogsAcc = await tx.account.findFirst({
        where: { tenantId, code: '9110' },
      });
      const inventoryAcc = await tx.account.findFirst({
        where: { tenantId, code: '2910' },
      });

      if (revenueAcc && receivableAcc) {
        const netRevenue = netRevenueUzs;
        const vatSum = Number(invoice.vatAmount) * ledgerRate;
        const journalLines: Array<{
          debitAccountId: string;
          creditAccountId: string;
          amount: number;
          description: string;
        }> = [];

        // Debit 4010 (Mijozlar qarzi) / Credit 9010 (Sotuv tushumi)
        journalLines.push({
          debitAccountId: receivableAcc.id,
          creditAccountId: revenueAcc.id,
          amount: netRevenue,
          description: `Sotuv tushumi № ${invoice.invoiceNumber}`,
        });

        // Debit 4010 (Mijozlar qarzi) / Credit 6410 (Chiquvchi QQS)
        if (vatSum > 0 && !vatAcc) {
          throw new BadRequestException('QQS hisob raqami (6410) topilmadi');
        }
        if (vatSum > 0 && vatAcc) {
          journalLines.push({
            debitAccountId: receivableAcc.id,
            creditAccountId: vatAcc.id,
            amount: vatSum,
            description: `Chiquvchi QQS № ${invoice.invoiceNumber}`,
          });
        }

        // Debit 9110 (COGS) / Credit 2910 (Ombordagi tovarlar)
        if (totalCogs > 0 && cogsAcc && inventoryAcc) {
          journalLines.push({
            debitAccountId: cogsAcc.id,
            creditAccountId: inventoryAcc.id,
            amount: totalCogs,
            description: `Sotilgan tovar tannarxi (COGS) № ${invoice.invoiceNumber}`,
          });
        }

        await tx.journalEntry.create({
          data: {
            tenantId,
            entryNumber,
            entryDate: invoice.invoiceDate,
            description: `Sotuv № ${invoice.invoiceNumber} (${invoice.counterparty.name})`,
            sourceDocType: 'SalesInvoice',
            sourceDocId: invoice.id,
            lines: { create: journalLines },
          },
        });
      }

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'SalesInvoice',
          entityId: invoice.id,
          action: 'UPDATE',
          oldValue: { status: 'DRAFT' },
          newValue: { status: 'POSTED', totalCogs, grossProfit },
        },
      });

      // 6. Update invoice header
      return tx.salesInvoice.update({
        where: { id },
        data: {
          status: SalesDocStatus.POSTED,
          totalCogs,
          grossProfit,
          postedById: userId,
          postedAt: new Date(),
        },
        include: {
          counterparty: true,
          warehouse: true,
          items: { include: { product: true } },
        },
      });
    });
  }

  // ─── UNPOST INVOICE ────────────────────────────────────────────

  async unpostInvoice(tenantId: string, userId: string, id: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });

    if (!invoice) throw new NotFoundException('Sotuv hujjati topilmadi');
    if (invoice.status !== SalesDocStatus.POSTED) {
      throw new BadRequestException(
        'Faqat tasdiqlangan hujjatlarni bekor qilish mumkin',
      );
    }
    if (
      Number(invoice.paidAmount) > 0 ||
      invoice.paymentStatus !== SalesPaymentStatus.UNPAID
    ) {
      throw new BadRequestException(
        "To'lov mavjud hujjatni bekor qilib bo'lmaydi. Avval Moliya modulida to'lovlarni o'chiring.",
      );
    }
    if (invoice.returnStatus !== SalesReturnStatus.NONE) {
      throw new BadRequestException(
        "Qaytarish mavjud hujjatni bekor qilib bo'lmaydi. Avval qaytarish hujjatlarini o'chiring.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Restore stock levels
      for (const item of invoice.items) {
        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: invoice.warehouseId,
              productId: item.productId,
            },
          },
        });

        if (stockLevel) {
          await tx.stockLevel.update({
            where: { id: stockLevel.id },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }

      // Restore product batches from batch consumptions
      const consumptions = await tx.batchConsumption.findMany({
        where: {
          salesInvoiceItem: { invoiceId: id },
        },
      });

      for (const c of consumptions) {
        await tx.productBatch.update({
          where: { id: c.batchId },
          data: { remainingQty: { increment: c.quantity } },
        });
      }

      await tx.batchConsumption.deleteMany({
        where: {
          salesInvoiceItem: { invoiceId: id },
        },
      });

      // Reverse the receivable without deleting its original ledger movement.
      await this.settlementService.recordMovement(tx, {
        tenantId,
        counterpartyId: invoice.counterpartyId,
        currency: invoice.currency,
        side: CounterpartySettlementSide.CUSTOMER,
        amount: -Number(invoice.totalAmount),
        entryType: 'SALES_INVOICE_UNPOSTED',
        effectiveAt: invoice.invoiceDate,
        sourceDocType: 'SalesInvoice',
        sourceDocId: invoice.id,
        idempotencyKey: `SalesInvoice:${invoice.id}:UNPOSTED:${invoice.updatedAt.toISOString()}`,
      });

      // Remove journal entries
      await tx.journalEntry.deleteMany({
        where: { tenantId, sourceDocType: 'SalesInvoice', sourceDocId: id },
      });

      // Reset COGS fields
      await tx.salesInvoiceItem.updateMany({
        where: { invoiceId: id },
        data: {
          unitCogs: 0,
          lineCogs: 0,
          lineGrossProfit: 0,
          isBelowCost: false,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'SalesInvoice',
          entityId: id,
          action: 'UPDATE',
          oldValue: { status: 'POSTED' },
          newValue: { status: 'DRAFT' },
        },
      });

      return tx.salesInvoice.update({
        where: { id },
        data: {
          status: SalesDocStatus.DRAFT,
          totalCogs: 0,
          grossProfit: 0,
          postedById: null,
          postedAt: null,
        },
        include: {
          counterparty: true,
          warehouse: true,
          items: { include: { product: true } },
        },
      });
    });
  }

  // ─── DELETE ───────────────────────────────────────────────────

  async deleteInvoice(tenantId: string, id: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, tenantId },
    });
    if (!invoice) throw new NotFoundException('Sotuv hujjati topilmadi');
    if (
      invoice.status !== SalesDocStatus.DRAFT &&
      invoice.status !== SalesDocStatus.CANCELLED
    ) {
      throw new BadRequestException(
        "Faqat qoralama yoki bekor qilingan holatdagi hujjatlarni o'chirish mumkin",
      );
    }
    await this.prisma.salesInvoice.delete({ where: { id } });
    return { success: true, message: "Sotuv hujjati o'chirildi" };
  }

  // ─── CUSTOMER RETURNS ─────────────────────────────────────────

  async getInvoiceReturnableItems(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        items: { include: { product: true } },
        returns: {
          where: { status: SalesReturnDocStatus.POSTED },
          include: { items: true },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Sotuv fakturasi topilmadi');
    }

    const returnedQtyMap = new Map<string, number>();
    for (const ret of invoice.returns) {
      for (const retItem of ret.items) {
        const current = returnedQtyMap.get(retItem.productId) || 0;
        returnedQtyMap.set(retItem.productId, current + Number(retItem.quantity));
      }
    }

    return invoice.items.map((item) => {
      const soldQuantity = Number(item.quantity);
      const returnedQuantity = returnedQtyMap.get(item.productId) || 0;
      const returnableQuantity = Math.max(0, soldQuantity - returnedQuantity);
      return {
        productId: item.productId,
        productName: item.product?.name,
        sku: item.product?.sku,
        barcode: item.product?.barcode,
        unit: item.product?.unitOfMeasure,
        soldQuantity,
        returnedQuantity,
        returnableQuantity,
          unitPrice: (Number(item.totalPrice) - Number(item.vatAmount || 0)) / soldQuantity,
          unitVatAmount: Number(item.vatAmount) / soldQuantity,
          vatRate: Number(item.vatRate),
          unitTotalPrice: Number(item.totalPrice) / soldQuantity,
          unitCogs: Number(item.unitCogs || 0),
      };
    });
  }

  async createReturn(
    tenantId: string,
    userId: string,
    dto: CreateSalesReturnDto,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException(
        "Qaytarish hujjatida kamida bitta tovar bo'lishi shart",
      );
    }

    if (!dto.currency || !SUPPORTED_CURRENCIES.includes(dto.currency as any)) {
      throw new BadRequestException(
        `Valyuta ko'rsatilishi shart va faqat quyidagilardan biri bo'lishi mumkin: ${SUPPORTED_CURRENCIES.join(', ')}`,
      );
    }

    const returnNumber = await this.generateReturnNumber(tenantId);
    let totalAmount = 0;
    let totalCogs = 0;

    let originalInvoice: any = null;
    const returnedQtyMap = new Map<string, number>();

    if (!dto.invoiceId) {
      throw new BadRequestException("Qaytarish faqat asl sotuv fakturasiga biriktirilishi mumkin");
    }

    originalInvoice = await this.prisma.salesInvoice.findFirst({
          where: { id: dto.invoiceId, tenantId, status: SalesDocStatus.POSTED },
          include: {
            items: true,
            returns: {
              where: { status: SalesReturnDocStatus.POSTED },
              include: { items: true },
            },
          },
        });
      if (!originalInvoice || originalInvoice.counterpartyId !== dto.counterpartyId || originalInvoice.currency !== dto.currency || originalInvoice.warehouseId !== dto.warehouseId) {
        throw new NotFoundException('Tanlangan sotuv fakturasi topilmadi');
      }

      for (const ret of originalInvoice.returns || []) {
        for (const retItem of ret.items || []) {
          const current = returnedQtyMap.get(retItem.productId) || 0;
          returnedQtyMap.set(retItem.productId, current + Number(retItem.quantity));
        }
      }

    const preparedItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      vatAmount: number;
      totalPrice: number;
      unitCogs: number;
      lineCogs: number;
      isDefective: boolean;
    }> = [];

    const requestedQtyByProduct = new Map<string, number>();
    for (const item of dto.items) {
      requestedQtyByProduct.set(item.productId, (requestedQtyByProduct.get(item.productId) ?? 0) + Number(item.quantity));
    }
    for (const i of dto.items) {
      const qty = Number(i.quantity);
      if (i.quantity == null || isNaN(qty) || qty <= 0) {
        throw new BadRequestException(
          "Qaytarish qatorida miqdor (quantity) 0 dan katta bo'lishi shart",
        );
      }
      let unitCogs = 0;
        const origItem = originalInvoice.items.find(
          (oi: any) => oi.productId === i.productId,
        );
        if (!origItem) {
          throw new BadRequestException(
            "Mahsulot tanlangan sotuv fakturasida mavjud emas",
          );
        }

        const soldQty = Number(origItem.quantity);
        const previouslyReturned = returnedQtyMap.get(i.productId) || 0;
        const remainingReturnable = Math.max(0, soldQty - previouslyReturned);

        if ((requestedQtyByProduct.get(i.productId) ?? 0) > remainingReturnable + 0.0001) {
          throw new BadRequestException(
            `"${origItem.productId}" bo'yicha qaytarish miqdori (${i.quantity}) asl sotuvdagi qoldiqdan (${remainingReturnable}) oshib ketdi (Over-return invariant)`,
          );
        }

        unitCogs = Number(origItem.unitCogs || 0);
        const unitTotalPrice = Number(origItem.totalPrice) / soldQty;
        const unitVatAmount = Number(origItem.vatAmount || 0) / soldQty;
        const unitPrice = unitTotalPrice - unitVatAmount;
        const lineVatAmount = roundMoney(unitVatAmount * qty);
        const lineTotal = roundMoney(unitPrice * qty + lineVatAmount);
        totalAmount += lineTotal;

      if (unitCogs <= 0) {
        const prod = await this.prisma.product.findUnique({
          where: { id: i.productId },
        });
        unitCogs = Number(prod?.costPrice || 0) * Number(prod?.costPriceExchangeRate || 1);
      }

      const lineCogs = i.quantity * unitCogs;
      totalCogs += lineCogs;

      preparedItems.push({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice,
        vatRate: Number(origItem.vatRate || 0),
        vatAmount: lineVatAmount,
        totalPrice: lineTotal,
        unitCogs,
        lineCogs,
        isDefective: Boolean(i.isDefective),
      });
    }

    const targetStatus = dto.status || SalesReturnDocStatus.POSTED;

    if (targetStatus === SalesReturnDocStatus.DRAFT) {
      return this.prisma.salesReturn.create({
        data: {
          tenantId,
          returnNumber,
          returnDate: dto.returnDate ? new Date(dto.returnDate) : new Date(),
          invoiceId: dto.invoiceId || null,
          counterpartyId: dto.counterpartyId,
          warehouseId: dto.warehouseId,
          defectWarehouseId: dto.defectWarehouseId || null,
          currency: dto.currency,
          reason: dto.reason || null,
          status: SalesReturnDocStatus.DRAFT,
          totalAmount,
          totalCogs,
          createdById: userId,
          items: { create: preparedItems },
        },
        include: {
          counterparty: true,
          warehouse: true,
          defectWarehouse: true,
          invoice: true,
          items: { include: { product: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    }

    // Otherwise POSTED (Immediate Confirmation)
    return this.executePostReturn(tenantId, userId, {
      returnNumber,
      returnDate: dto.returnDate ? new Date(dto.returnDate) : new Date(),
      invoiceId: dto.invoiceId,
      counterpartyId: dto.counterpartyId,
      warehouseId: dto.warehouseId,
      defectWarehouseId: dto.defectWarehouseId,
      currency: dto.currency,
      reason: dto.reason,
      totalAmount,
      totalCogs,
      preparedItems,
    });
  }

  private async executePostReturn(
    tenantId: string,
    userId: string,
    params: {
      existingReturnId?: string;
      returnNumber: string;
      returnDate: Date;
      invoiceId?: string | null;
      counterpartyId: string;
      warehouseId: string;
      defectWarehouseId?: string | null;
      currency: string;
      reason?: string | null;
      totalAmount: number;
      totalCogs: number;
      preparedItems: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        vatRate: number;
        vatAmount: number;
        totalPrice: number;
        unitCogs: number;
        lineCogs: number;
        isDefective: boolean;
      }>;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      let salesReturn;
      if (params.existingReturnId) {
        salesReturn = await tx.salesReturn.update({
          where: { id: params.existingReturnId },
          data: {
            status: SalesReturnDocStatus.POSTED,
          },
          include: {
            counterparty: true,
            warehouse: true,
            defectWarehouse: true,
            invoice: true,
            items: { include: { product: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        });
      } else {
        salesReturn = await tx.salesReturn.create({
          data: {
            tenantId,
            returnNumber: params.returnNumber,
            returnDate: params.returnDate,
            invoiceId: params.invoiceId || null,
            counterpartyId: params.counterpartyId,
            warehouseId: params.warehouseId,
            defectWarehouseId: params.defectWarehouseId || null,
            currency: params.currency,
            reason: params.reason || null,
            status: SalesReturnDocStatus.POSTED,
            totalAmount: params.totalAmount,
            totalCogs: params.totalCogs,
            createdById: userId,
            items: { create: params.preparedItems },
          },
          include: {
            counterparty: true,
            warehouse: true,
            defectWarehouse: true,
            invoice: true,
            items: { include: { product: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        });
      }

      // Restock inventory and create product batches with defect warehouse routing
      for (const item of params.preparedItems) {
        const targetWarehouseId =
          item.isDefective && params.defectWarehouseId
            ? params.defectWarehouseId
            : params.warehouseId;

        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: targetWarehouseId,
              productId: item.productId,
            },
          },
        });

        if (stockLevel) {
          await tx.stockLevel.update({
            where: { id: stockLevel.id },
            data: { quantity: { increment: item.quantity } },
          });
        } else {
          await tx.stockLevel.create({
            data: {
              tenantId,
              warehouseId: targetWarehouseId,
              productId: item.productId,
              quantity: item.quantity,
              reservedQuantity: 0,
            },
          });
        }

        // ProductBatch with historical landed cost
        await tx.productBatch.create({
          data: {
            tenantId,
            productId: item.productId,
            warehouseId: targetWarehouseId,
            batchNumber: `RET-${params.returnNumber}-${item.productId.slice(0, 4)}`,
            initialQty: item.quantity,
            remainingQty: item.quantity,
            purchasePrice: item.unitCogs,
            landedCost: item.unitCogs,
          },
        });
      }

      // A posted customer return reverses the original receivable, including VAT.
      await this.settlementService.recordMovement(tx, {
        tenantId,
        counterpartyId: params.counterpartyId,
        currency: params.currency,
        side: CounterpartySettlementSide.CUSTOMER,
        amount: -params.totalAmount,
        entryType: 'SALES_RETURN_POSTED',
        effectiveAt: salesReturn.returnDate,
        sourceDocType: 'SalesReturn',
        sourceDocId: salesReturn.id,
        idempotencyKey: `SalesReturn:${salesReturn.id}:POSTED`,
      });

      // Update originating invoice returnStatus
      if (params.invoiceId) {
        const origInvoice = await tx.salesInvoice.findUnique({
          where: { id: params.invoiceId },
          include: {
            returns: {
              where: { status: SalesReturnDocStatus.POSTED },
            },
          },
        });
        if (origInvoice) {
          const totalReturned =
            origInvoice.returns.reduce((s, r) => s + Number(r.totalAmount), 0) +
            (params.existingReturnId ? 0 : params.totalAmount);
          const newReturnStatus =
            totalReturned >= Number(origInvoice.totalAmount)
              ? SalesReturnStatus.FULLY_RETURNED
              : SalesReturnStatus.PARTIALLY_RETURNED;
          await tx.salesInvoice.update({
            where: { id: params.invoiceId },
            data: { returnStatus: newReturnStatus },
          });
        }
      }

      // Double-entry accounting reversal for Sales Return (BHMS)
      const originalInvoice = await tx.salesInvoice.findUnique({
        where: { id: params.invoiceId! },
        include: { items: true },
      });
      if (!originalInvoice) {
        throw new NotFoundException('Asl sotuv fakturasi topilmadi');
      }
      const ledgerRate = originalInvoice.currency === 'USD' ? Number(originalInvoice.exchangeRate) : 1;
      if (!Number.isFinite(ledgerRate) || ledgerRate <= 0) {
        throw new BadRequestException("Asl sotuv fakturasining valyuta kursi noto'g'ri");
      }
      const returnedVat = params.preparedItems.reduce((sum, item) => {
        const invoiceItem = originalInvoice.items.find((candidate) => candidate.productId === item.productId);
        return sum + (invoiceItem ? (Number(invoiceItem.vatAmount) / Number(invoiceItem.quantity)) * item.quantity : 0);
      }, 0);
      const returnedNetRevenue = params.totalAmount - returnedVat;
      const revenueAcc = await tx.account.findFirst({
        where: { tenantId, code: '9010' },
      });
      const receivableAcc = await tx.account.findFirst({
        where: { tenantId, code: '4010' },
      });
      const vatAcc = await tx.account.findFirst({ where: { tenantId, code: '6410' } });
      const cogsAcc = await tx.account.findFirst({
        where: { tenantId, code: '9110' },
      });
      const inventoryAcc = await tx.account.findFirst({
        where: { tenantId, code: '2910' },
      });

      const journalLines: Array<{
        debitAccountId: string;
        creditAccountId: string;
        amount: number;
        description: string;
      }> = [];

      if (revenueAcc && receivableAcc && returnedNetRevenue > 0) {
        journalLines.push({
          debitAccountId: revenueAcc.id,
          creditAccountId: receivableAcc.id,
          amount: returnedNetRevenue * ledgerRate,
          description: `Sotuv qaytarilishi № ${params.returnNumber}`,
        });
      }
      if (vatAcc && receivableAcc && returnedVat > 0) {
        journalLines.push({
          debitAccountId: vatAcc.id,
          creditAccountId: receivableAcc.id,
          amount: returnedVat * ledgerRate,
          description: `Chiquvchi QQS qaytarilishi № ${params.returnNumber}`,
        });
      }
      if (cogsAcc && inventoryAcc && params.totalCogs > 0) {
        journalLines.push({
          debitAccountId: inventoryAcc.id,
          creditAccountId: cogsAcc.id,
          amount: params.totalCogs,
          description: `Sotuv qaytarilishi tannarxi № ${params.returnNumber}`,
        });
      }

      if (journalLines.length > 0) {
        const entryCount = await tx.journalEntry.count({ where: { tenantId } });
        const entryNumber = `JE-${new Date().getFullYear()}-${(entryCount + 1).toString().padStart(5, '0')}`;
        await tx.journalEntry.create({
          data: {
            tenantId,
            entryNumber,
            entryDate: salesReturn.returnDate,
            description: `Sotuv qaytarilishi № ${params.returnNumber}`,
            sourceDocType: 'SalesReturn',
            sourceDocId: salesReturn.id,
            lines: { create: journalLines },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'SalesReturn',
          entityId: salesReturn.id,
          action: 'UPDATE',
          newValue: {
            returnNumber: params.returnNumber,
            totalAmount: params.totalAmount,
            totalCogs: params.totalCogs,
            status: SalesReturnDocStatus.POSTED,
          },
        },
      });

      return salesReturn;
    });
  }

  async confirmReturn(tenantId: string, userId: string, returnId: string) {
    const existing = await this.prisma.salesReturn.findFirst({
      where: { id: returnId, tenantId },
      include: {
        items: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Qaytarish hujjati topilmadi');
    }
    if (existing.status !== SalesReturnDocStatus.DRAFT) {
      throw new BadRequestException(
        'Faqat qoralama (DRAFT) holatidagi qaytarishni tasdiqlash mumkin',
      );
    }

    // Check over-return invariant against originating invoice if present
    if (existing.invoiceId) {
      const origInvoice = await this.prisma.salesInvoice.findFirst({
        where: { id: existing.invoiceId, tenantId },
        include: {
          items: true,
          returns: {
            where: { status: SalesReturnDocStatus.POSTED },
            include: { items: true },
          },
        },
      });

      if (origInvoice) {
        const returnedQtyMap = new Map<string, number>();
        for (const ret of origInvoice.returns) {
          for (const retItem of ret.items) {
            const current = returnedQtyMap.get(retItem.productId) || 0;
            returnedQtyMap.set(retItem.productId, current + Number(retItem.quantity));
          }
        }

        for (const item of existing.items) {
          const origItem = origInvoice.items.find(
            (oi) => oi.productId === item.productId,
          );
          if (origItem) {
            const soldQty = Number(origItem.quantity);
            const prevReturned = returnedQtyMap.get(item.productId) || 0;
            const remaining = Math.max(0, soldQty - prevReturned);
            if (Number(item.quantity) > remaining + 0.0001) {
              throw new BadRequestException(
                `Qaytarish miqdori asl sotuvdagi qoldiqdan oshib ketdi (${remaining})`,
              );
            }
          }
        }
      }
    }

    const preparedItems = existing.items.map((i) => ({
      productId: i.productId,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      vatRate: Number(i.vatRate || 0),
      vatAmount: Number(i.vatAmount || 0),
      totalPrice: Number(i.totalPrice),
      unitCogs: Number(i.unitCogs),
      lineCogs: Number(i.lineCogs),
      isDefective: Boolean(i.isDefective),
    }));

    return this.executePostReturn(tenantId, userId, {
      existingReturnId: existing.id,
      returnNumber: existing.returnNumber,
      returnDate: existing.returnDate,
      invoiceId: existing.invoiceId,
      counterpartyId: existing.counterpartyId,
      warehouseId: existing.warehouseId,
      defectWarehouseId: existing.defectWarehouseId,
      currency: existing.currency,
      reason: existing.reason,
      totalAmount: Number(existing.totalAmount),
      totalCogs: Number(existing.totalCogs),
      preparedItems,
    });
  }

  async cancelReturn(tenantId: string, userId: string, returnId: string) {
    const existing = await this.prisma.salesReturn.findFirst({
      where: { id: returnId, tenantId },
      include: {
        items: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Qaytarish hujjati topilmadi');
    }
    if (existing.status === SalesReturnDocStatus.CANCELLED) {
      throw new BadRequestException('Ushbu qaytarish allaqachon bekor qilingan');
    }

    if (existing.status === SalesReturnDocStatus.DRAFT) {
      return this.prisma.salesReturn.update({
        where: { id: returnId },
        data: { status: SalesReturnDocStatus.CANCELLED },
      });
    }

    const returnAllocations = await this.prisma.settlementAllocation.findMany({
      where: {
        tenantId,
        targetType: SettlementAllocationTarget.SALES_RETURN,
        targetId: existing.id,
      },
      select: { amount: true },
    });
    const activeRefundAmount = returnAllocations.reduce(
      (sum, allocation) => sum + Number(allocation.amount),
      0,
    );
    if (activeRefundAmount > 0) {
      throw new BadRequestException(
        'Moliya settlement allocation exists for this sales return; reverse it before cancelling the return',
      );
    }

    // If POSTED, execute rollback guardrail and reversals
    return this.prisma.$transaction(async (tx) => {
      // Check stock availability in target warehouses
      for (const item of existing.items) {
        const targetWarehouseId =
          item.isDefective && existing.defectWarehouseId
            ? existing.defectWarehouseId
            : existing.warehouseId;

        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: targetWarehouseId,
              productId: item.productId,
            },
          },
        });

        if (!stockLevel || Number(stockLevel.quantity) < Number(item.quantity)) {
          throw new BadRequestException(
            "Qaytarilgan tovarlar keyingi sotuvlarda sarflangan, qaytarishni bekor qilib bo'lmaydi (Rollback Guardrail)",
          );
        }

        // Deduct returned stock
        await tx.stockLevel.update({
          where: { id: stockLevel.id },
          data: { quantity: { decrement: Number(item.quantity) } },
        });

        // Delete/deduct the created return batch
        const batchNumber = `RET-${existing.returnNumber}-${item.productId.slice(0, 4)}`;
        const batch = await tx.productBatch.findFirst({
          where: {
            tenantId,
            productId: item.productId,
            warehouseId: targetWarehouseId,
            batchNumber,
          },
        });
        if (batch) {
          if (Number(batch.remainingQty) < Number(item.quantity)) {
            throw new BadRequestException(
              "Qaytarilgan partiyadan tovar sarflangan, bekor qilish mumkin emas",
            );
          }
          await tx.productBatch.delete({ where: { id: batch.id } });
        }
      }

      // Cancelling a return reverses its balance movement as a new ledger entry.
      await this.settlementService.recordMovement(tx, {
        tenantId,
        counterpartyId: existing.counterpartyId,
        currency: existing.currency,
        side: CounterpartySettlementSide.CUSTOMER,
        amount: Number(existing.totalAmount),
        entryType: 'SALES_RETURN_CANCELLED',
        effectiveAt: existing.returnDate,
        sourceDocType: 'SalesReturn',
        sourceDocId: existing.id,
        idempotencyKey: `SalesReturn:${existing.id}:CANCELLED`,
      });

      // Update invoice return status
      if (existing.invoiceId) {
        const origInvoice = await tx.salesInvoice.findUnique({
          where: { id: existing.invoiceId },
          include: {
            returns: {
              where: {
                status: SalesReturnDocStatus.POSTED,
                id: { not: existing.id },
              },
            },
          },
        });
        if (origInvoice) {
          const remainingReturned = origInvoice.returns.reduce(
            (s, r) => s + Number(r.totalAmount),
            0,
          );
          const newStatus =
            remainingReturned <= 0
              ? SalesReturnStatus.NONE
              : remainingReturned >= Number(origInvoice.totalAmount)
                ? SalesReturnStatus.FULLY_RETURNED
                : SalesReturnStatus.PARTIALLY_RETURNED;
          await tx.salesInvoice.update({
            where: { id: existing.invoiceId },
            data: { returnStatus: newStatus },
          });
        }
      }

      // Reversal double-entry journal entries
      const revenueAcc = await tx.account.findFirst({
        where: { tenantId, code: '9010' },
      });
      const receivableAcc = await tx.account.findFirst({
        where: { tenantId, code: '4010' },
      });
      const cogsAcc = await tx.account.findFirst({
        where: { tenantId, code: '9110' },
      });
      const inventoryAcc = await tx.account.findFirst({
        where: { tenantId, code: '2910' },
      });

      const journalLines: Array<{
        debitAccountId: string;
        creditAccountId: string;
        amount: number;
        description: string;
      }> = [];

      const totalAmount = Number(existing.totalAmount);
      const totalCogs = Number(existing.totalCogs);

      if (revenueAcc && receivableAcc && totalAmount > 0) {
        journalLines.push({
          debitAccountId: receivableAcc.id,
          creditAccountId: revenueAcc.id,
          amount: totalAmount,
          description: `Sotuv qaytarilishini bekor qilish № ${existing.returnNumber}`,
        });
      }
      if (cogsAcc && inventoryAcc && totalCogs > 0) {
        journalLines.push({
          debitAccountId: cogsAcc.id,
          creditAccountId: inventoryAcc.id,
          amount: totalCogs,
          description: `Sotuv qaytarilishini bekor qilish tannarxi № ${existing.returnNumber}`,
        });
      }

      if (journalLines.length > 0) {
        const entryCount = await tx.journalEntry.count({ where: { tenantId } });
        const entryNumber = `JE-${new Date().getFullYear()}-${(entryCount + 1).toString().padStart(5, '0')}`;
        await tx.journalEntry.create({
          data: {
            tenantId,
            entryNumber,
            entryDate: new Date(),
            description: `Sotuv qaytarilishini bekor qilish № ${existing.returnNumber}`,
            sourceDocType: 'SalesReturnCancel',
            sourceDocId: existing.id,
            lines: { create: journalLines },
          },
        });
      }

      const cancelledReturn = await tx.salesReturn.update({
        where: { id: returnId },
        data: { status: SalesReturnDocStatus.CANCELLED },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'SalesReturn',
          entityId: existing.id,
          action: 'UPDATE',
          newValue: { status: SalesReturnDocStatus.CANCELLED },
        },
      });

      return cancelledReturn;
    });
  }

  async deleteReturn(tenantId: string, userId: string, returnId: string) {
    const existing = await this.prisma.salesReturn.findFirst({
      where: { id: returnId, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Qaytarish hujjati topilmadi');
    }

    if (
      existing.status !== SalesReturnDocStatus.DRAFT &&
      existing.status !== SalesReturnDocStatus.CANCELLED
    ) {
      throw new BadRequestException(
        "Faqat 'Qoralama' yoki 'Bekor qilingan' holatidagi qaytarish hujjatlarini o'chirish mumkin",
      );
    }

    await this.prisma.salesReturnItem.deleteMany({
      where: { returnId },
    });

    await this.prisma.salesReturn.delete({
      where: { id: returnId },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        entityType: 'SalesReturn',
        entityId: returnId,
        action: 'DELETE',
        oldValue: { returnNumber: existing.returnNumber },
      },
    });

    return {
      success: true,
      message: "Qaytarish hujjati muvaffaqiyatli o'chirildi",
    };
  }

  async findAllReturns(tenantId: string) {
    return this.prisma.salesReturn.findMany({
      where: { tenantId },
      include: {
        counterparty: true,
        warehouse: true,
        defectWarehouse: true,
        invoice: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneReturn(tenantId: string, id: string) {
    const ret = await this.prisma.salesReturn.findFirst({
      where: { id, tenantId },
      include: {
        counterparty: true,
        warehouse: true,
        defectWarehouse: true,
        invoice: { include: { items: { include: { product: true } } } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: true } },
      },
    });
    if (!ret) {
      throw new NotFoundException('Qaytarish hujjati topilmadi');
    }
    return ret;
  }

  // ─── PRICE LISTS ──────────────────────────────────────────────

  async findAllPriceLists(tenantId: string) {
    return this.prisma.priceList.findMany({
      where: { tenantId, isActive: true },
      include: {
        prices: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createPriceList(
    tenantId: string,
    data: {
      name: { uz: string; ru: string };
      currency: string;
      isDefault?: boolean;
    },
  ) {
    return this.prisma.priceList.create({
      data: {
        tenantId,
        name: data.name,
        currency: data.currency,
        isDefault: data.isDefault || false,
      },
    });
  }

  async upsertProductPrice(
    tenantId: string,
    priceListId: string,
    productId: string,
    price: number,
  ) {
    // Verify price list belongs to tenant
    const pl = await this.prisma.priceList.findFirst({
      where: { id: priceListId, tenantId },
    });
    if (!pl) throw new NotFoundException('Narx jadvali topilmadi');

    return this.prisma.productPrice.upsert({
      where: { priceListId_productId: { priceListId, productId } },
      update: { price },
      create: { priceListId, productId, price },
      include: { product: true },
    });
  }

  async getProductPriceFromList(
    tenantId: string,
    priceListId: string,
    productId: string,
  ) {
    const pp = await this.prisma.productPrice.findUnique({
      where: { priceListId_productId: { priceListId, productId } },
    });
    return pp;
  }

  async updatePriceList(
    tenantId: string,
    id: string,
    data: {
      name?: { uz: string; ru: string };
      currency?: string;
      isDefault?: boolean;
      isActive?: boolean;
    },
  ) {
    const pl = await this.prisma.priceList.findFirst({
      where: { id, tenantId },
    });
    if (!pl) throw new NotFoundException('Narx jadvali topilmadi');

    if (data.isDefault) {
      await this.prisma.priceList.updateMany({
        where: { tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.priceList.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.currency ? { currency: data.currency } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  async deletePriceList(tenantId: string, id: string) {
    const pl = await this.prisma.priceList.findFirst({
      where: { id, tenantId },
      include: {
        _count: {
          select: { salesOrders: true, salesInvoices: true, counterparties: true },
        },
      },
    });
    if (!pl) throw new NotFoundException('Narx jadvali topilmadi');

    if (
      pl._count.salesOrders > 0 ||
      pl._count.salesInvoices > 0 ||
      pl._count.counterparties > 0
    ) {
      return this.prisma.priceList.update({
        where: { id },
        data: { isActive: false },
      });
    }

    return this.prisma.priceList.delete({
      where: { id },
    });
  }

  async bulkSetPrices(
    tenantId: string,
    priceListId: string,
    items: { productId: string; price: number }[],
  ) {
    const pl = await this.prisma.priceList.findFirst({
      where: { id: priceListId, tenantId },
    });
    if (!pl) throw new NotFoundException('Narx jadvali topilmadi');

    const results = [];
    for (const item of items) {
      const priceVal = Number(item.price);
      if (isNaN(priceVal) || priceVal < 0) continue;

      const updated = await this.prisma.productPrice.upsert({
        where: { priceListId_productId: { priceListId, productId: item.productId } },
        update: { price: priceVal },
        create: { priceListId, productId: item.productId, price: priceVal },
        include: { product: true },
      });
      results.push(updated);
    }
    return results;
  }

  private convertSalePriceCurrency(
    amount: number,
    sourceCurrency: string,
    targetCurrency: string,
    exchangeRate?: number,
  ) {
    if (
      !SUPPORTED_CURRENCIES.includes(sourceCurrency as (typeof SUPPORTED_CURRENCIES)[number]) ||
      !SUPPORTED_CURRENCIES.includes(targetCurrency as (typeof SUPPORTED_CURRENCIES)[number])
    ) {
      throw new BadRequestException('Product and sales document prices must use USD or UZS');
    }
    if (sourceCurrency === targetCurrency) return Number(amount.toFixed(2));
    const rate = Number(exchangeRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new BadRequestException('A positive exchange rate is required to convert the product sale price');
    }
    const converted = sourceCurrency === 'USD' ? amount * rate : amount / rate;
    return Number(converted.toFixed(2));
  }

  async resolveProductPrice(
    tenantId: string,
    productId: string,
    options: {
      counterpartyId?: string;
      priceListId?: string;
      currency?: string;
      exchangeRate?: number;
    } = {},
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (company?.settings as any) || {};
    const isMultiTierEnabled = Boolean(
      settings?.sales?.enableMultiTierPriceLists,
    );

    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true, salePrice: true, salePriceCurrency: true, name: true, sku: true },
    });
    if (!product) throw new NotFoundException('Tovar topilmadi');

    const basePrice = Number(product.salePrice) || 0;
    if (basePrice > 0 && !product.salePriceCurrency) {
      throw new BadRequestException(`Product ${product.sku} has a sale price without a recoverable currency`);
    }
    const baseCurrency = product.salePriceCurrency ?? options.currency ?? 'UZS';
    const baseTargetCurrency = options.currency ?? baseCurrency;
    if (!SUPPORTED_CURRENCIES.includes(baseTargetCurrency as (typeof SUPPORTED_CURRENCIES)[number])) {
      throw new BadRequestException('Sales document currency must be USD or UZS');
    }
    const basePriceInTargetCurrency = this.convertSalePriceCurrency(
      basePrice,
      baseCurrency,
      baseTargetCurrency,
      options.exchangeRate,
    );

    if (!isMultiTierEnabled) {
      return {
        resolvedPrice: basePriceInTargetCurrency,
        basePrice,
        baseCurrency,
        discountPercent: 0,
        markupPercent: 0,
        isTierPrice: false,
        priceListId: null,
        priceListName: null,
        currency: baseTargetCurrency,
      };
    }

    let targetPriceListId = options.priceListId || null;

    if (!targetPriceListId && options.counterpartyId) {
      const counterparty = await this.prisma.counterparty.findFirst({
        where: { id: options.counterpartyId, tenantId },
        select: { priceListId: true },
      });
      if (counterparty?.priceListId) {
        targetPriceListId = counterparty.priceListId;
      }
    }

    if (!targetPriceListId) {
      const defaultPL = await this.prisma.priceList.findFirst({
        where: { tenantId, isDefault: true, isActive: true },
        select: { id: true },
      });
      if (defaultPL) {
        targetPriceListId = defaultPL.id;
      }
    }

    if (!targetPriceListId) {
      return {
        resolvedPrice: basePriceInTargetCurrency,
        basePrice,
        baseCurrency,
        discountPercent: 0,
        markupPercent: 0,
        isTierPrice: false,
        priceListId: null,
        priceListName: null,
        currency: baseTargetCurrency,
      };
    }

    const priceList = await this.prisma.priceList.findFirst({
      where: { id: targetPriceListId, tenantId, isActive: true },
    });

    if (!priceList) {
      return {
        resolvedPrice: basePriceInTargetCurrency,
        basePrice,
        baseCurrency,
        discountPercent: 0,
        markupPercent: 0,
        isTierPrice: false,
        priceListId: null,
        priceListName: null,
        currency: baseTargetCurrency,
      };
    }

    const customPrice = await this.prisma.productPrice.findUnique({
      where: {
        priceListId_productId: { priceListId: targetPriceListId, productId },
      },
    });

    if (!customPrice) {
      return {
        resolvedPrice: basePriceInTargetCurrency,
        basePrice,
        baseCurrency,
        discountPercent: 0,
        markupPercent: 0,
        isTierPrice: false,
        priceListId: priceList.id,
        priceListName: priceList.name,
        currency: baseTargetCurrency,
      };
    }

    const targetCurrency = options.currency || priceList.currency;
    const tierPrice = this.convertSalePriceCurrency(
      Number(customPrice.price),
      priceList.currency,
      targetCurrency,
      options.exchangeRate,
    );
    const comparableBasePrice = this.convertSalePriceCurrency(
      basePrice,
      baseCurrency,
      targetCurrency,
      options.exchangeRate,
    );

    let discountPercent = 0;
    let markupPercent = 0;

    if (comparableBasePrice > 0) {
      if (tierPrice < comparableBasePrice) {
        discountPercent = Number(
          (((comparableBasePrice - tierPrice) / comparableBasePrice) * 100).toFixed(2),
        );
      } else if (tierPrice > comparableBasePrice) {
        markupPercent = Number(
          (((tierPrice - comparableBasePrice) / comparableBasePrice) * 100).toFixed(2),
        );
      }
    }

    return {
      resolvedPrice: tierPrice,
      basePrice,
      baseCurrency,
      discountPercent,
      markupPercent,
      isTierPrice: true,
      priceListId: priceList.id,
      priceListName: priceList.name,
      currency: targetCurrency,
    };
  }

  // ─── SUMMARY STATS ────────────────────────────────────────────

  async getSummaryStats(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const postedInvoices = await this.prisma.salesInvoice.findMany({
      where: {
        tenantId,
        status: SalesDocStatus.POSTED,
        invoiceDate: { gte: startOfMonth },
      },
      select: {
        totalAmount: true,
        vatAmount: true,
        totalCogs: true,
        grossProfit: true,
        currency: true,
        exchangeRate: true,
      },
    });

    const salesByCurrMap: Record<string, number> = {};
    let profitUzs = 0;
    let netSalesUzs = 0;
    let totalSales = 0;
    let totalCogs = 0;

    for (const inv of postedInvoices) {
      const amt = Number(inv.totalAmount || 0);
      const cogs = Number(inv.totalCogs || 0);
      const profit = Number(inv.grossProfit || 0);
      const curr = inv.currency;
      const exchangeRate = curr === 'UZS' ? 1 : Number(inv.exchangeRate);
      if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        throw new BadRequestException(`Posted sales invoice has an invalid ${curr} exchange rate`);
      }

      salesByCurrMap[curr] = (salesByCurrMap[curr] || 0) + amt;
      totalSales += amt;
      totalCogs += cogs;
      netSalesUzs += (amt - Number(inv.vatAmount || 0)) * exchangeRate;
      profitUzs += profit;
    }

    const monthlySalesByCurrency = Object.entries(salesByCurrMap).map(([currency, amount]) => ({
      currency,
      amount,
    }));
    const postedReturns = await this.prisma.salesReturn.findMany({
      where: { tenantId, returnDate: { gte: startOfMonth } },
      select: {
        totalAmount: true,
        totalCogs: true,
        currency: true,
        invoice: { select: { exchangeRate: true, currency: true } },
        items: { select: { vatAmount: true } },
      },
    });

    const returnsByCurrMap: Record<string, number> = {};
    let monthlyReturnsTotal = 0;
    let returnedNetRevenueUzs = 0;
    for (const ret of postedReturns) {
      const amt = Number(ret.totalAmount || 0);
      const curr = ret.currency;
      const exchangeRate = curr === 'UZS' ? 1 : Number(ret.invoice?.exchangeRate);
      if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        throw new BadRequestException(`Posted sales return has an invalid ${curr} exchange rate`);
      }
      returnsByCurrMap[curr] = (returnsByCurrMap[curr] || 0) + amt;
      monthlyReturnsTotal += amt;
      const returnedVat = ret.items.reduce((sum, item) => sum + Number(item.vatAmount || 0), 0);
      returnedNetRevenueUzs += (amt - returnedVat) * exchangeRate;
      const returnedCogs = Number(ret.totalCogs || 0);
      totalCogs -= returnedCogs;
      profitUzs -= (amt - returnedVat) * exchangeRate - returnedCogs;
    }

    const monthlyReturnsByCurrency = Object.entries(returnsByCurrMap).map(([currency, amount]) => ({
      currency,
      amount,
    }));
    if (monthlyReturnsByCurrency.length !== 1) monthlyReturnsTotal = 0;
    const monthlyGrossProfitByCurrency = profitUzs !== 0 || postedInvoices.length > 0 || postedReturns.length > 0
      ? [{ currency: 'UZS', amount: profitUzs }]
      : [];

    const counterpartyBalances = await this.prisma.counterpartyBalance.findMany({
      where: { tenantId },
      select: { counterpartyId: true, currency: true, customerDebt: true },
    });
    const debtByCurrMap: Record<string, number> = {};
    const advancesByCurrMap: Record<string, number> = {};
    const customersWithReceivables = new Set<string>();
    for (const balance of counterpartyBalances) {
      const customerDebt = Number(balance.customerDebt);
      if (customerDebt > 0) {
        debtByCurrMap[balance.currency] = (debtByCurrMap[balance.currency] || 0) + customerDebt;
        customersWithReceivables.add(balance.counterpartyId);
      } else if (customerDebt < 0) {
        advancesByCurrMap[balance.currency] = (advancesByCurrMap[balance.currency] || 0) + Math.abs(customerDebt);
      }
    }

    const totalCustomerDebtByCurrency = Object.entries(debtByCurrMap).map(([currency, amount]) => ({ currency, amount }));
    const customerAdvancesByCurrency = Object.entries(advancesByCurrMap).map(([currency, amount]) => ({ currency, amount }));
    const rawTotalDebt = totalCustomerDebtByCurrency.length === 1 ? totalCustomerDebtByCurrency[0].amount : 0;

    const margin = netSalesUzs > returnedNetRevenueUzs
      ? (profitUzs / (netSalesUzs - returnedNetRevenueUzs)) * 100
      : 0;
    const monthlySalesTotal = monthlySalesByCurrency.length === 1 ? monthlySalesByCurrency[0].amount : 0;

    return {
      monthlySalesTotal,
      monthlySalesCount: postedInvoices.length,
      monthlyCogsTotal: totalCogs,
      monthlyGrossProfit: profitUzs,
      monthlyGrossProfitMargin: Math.round(margin * 100) / 100,
      totalCustomerDebt: rawTotalDebt,
      customersWithDebtCount: customersWithReceivables.size,
      monthlyReturnsTotal,
      currency: monthlySalesByCurrency.length === 1 ? monthlySalesByCurrency[0].currency : 'UZS',
      monthlySalesByCurrency,
      totalCustomerDebtByCurrency,
      customerAdvancesByCurrency,
      monthlyReturnsByCurrency,
      monthlyGrossProfitByCurrency,
    };
  }

  // ─── CUSTOMER PROFILE ─────────────────────────────────────────

  async getCustomerProfile(tenantId: string, customerId: string) {
    const customer = await this.prisma.counterparty.findFirst({
      where: { id: customerId, tenantId },
    });
    if (!customer) throw new NotFoundException('Mijoz topilmadi');

    const invoices = await this.prisma.salesInvoice.findMany({
      where: { tenantId, counterpartyId: customerId },
      include: { warehouse: true, items: { include: { product: true } } },
      orderBy: { invoiceDate: 'desc' },
    });

    const returns = await this.prisma.salesReturn.findMany({
      where: { tenantId, counterpartyId: customerId },
      include: {
        invoice: { select: { currency: true, exchangeRate: true } },
        items: { select: { vatAmount: true } },
      },
      orderBy: { returnDate: 'desc' },
    });

    const payments = await this.prisma.financeTransaction.findMany({
      where: { tenantId, counterpartyId: customerId, direction: 'INCOME', status: 'POSTED', isDeleted: false },
      include: { account: true },
      orderBy: { transactionDate: 'desc' },
    });

    const postedInvoices = invoices.filter((invoice) => invoice.status === SalesDocStatus.POSTED);
    const postedReturns = returns.filter((salesReturn) => salesReturn.status === SalesReturnDocStatus.POSTED);
    const aggregateByCurrency = (rows: Array<{ currency: string; amount: number }>) => {
      const totals = new Map<string, number>();
      for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount);
      return Array.from(totals).sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => ({ currency, amount }));
    };
    const totalSalesByCurrency = aggregateByCurrency(postedInvoices.map((invoice) => ({
      currency: invoice.currency,
      amount: Number(invoice.totalAmount),
    })));
    const totalPaidByCurrency = aggregateByCurrency(payments.map((payment) => ({
      currency: payment.currency,
      amount: Number(payment.amount),
    })));
    const totalReturnedByCurrency = aggregateByCurrency(postedReturns.map((salesReturn) => ({
      currency: salesReturn.currency,
      amount: Number(salesReturn.totalAmount),
    })));
    const amountForSingleCurrency = (values: Array<{ currency: string; amount: number }>) => values.length === 1 ? values[0].amount : 0;
    let totalCogs = postedInvoices.reduce((sum, invoice) => sum + Number(invoice.totalCogs || 0), 0);
    let grossProfit = postedInvoices.reduce((sum, invoice) => sum + Number(invoice.grossProfit || 0), 0);
    for (const salesReturn of postedReturns) {
      const currency = salesReturn.invoice?.currency || salesReturn.currency;
      const exchangeRate = currency === 'UZS' ? 1 : Number(salesReturn.invoice?.exchangeRate);
      if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        throw new BadRequestException(`Posted sales return has an invalid ${currency} exchange rate`);
      }
      const returnedVat = salesReturn.items.reduce((sum, item) => sum + Number(item.vatAmount || 0), 0);
      const returnedCogs = Number(salesReturn.totalCogs || 0);
      totalCogs -= returnedCogs;
      grossProfit -= (Number(salesReturn.totalAmount) - returnedVat) * exchangeRate - returnedCogs;
    }
    const balances = await this.prisma.counterpartyBalance.findMany({
      where: { tenantId, counterpartyId: customerId },
      select: { currency: true, customerDebt: true, supplierDebt: true },
      orderBy: { currency: 'asc' },
    });
    const balancesByCurrency = balances.map((balance) => ({
      currency: balance.currency,
      customerDebt: Number(balance.customerDebt),
      supplierDebt: Number(balance.supplierDebt),
      netBalance: Number(balance.customerDebt) - Number(balance.supplierDebt),
    }));
    const receivableCurrencies = balancesByCurrency.filter((balance) => balance.customerDebt > 0);
    const customerAdvancesByCurrency = balancesByCurrency
      .filter((balance) => balance.customerDebt < 0)
      .map((balance) => ({ currency: balance.currency, amount: Math.abs(balance.customerDebt) }));
    const { debtBalance: _legacyDebtBalance, customerDebt: _legacyCustomerDebt, supplierDebt: _legacySupplierDebt, ...customerData } = customer;

    return {
      customer: { ...customerData, balancesByCurrency },
      metrics: {
        totalSales: amountForSingleCurrency(totalSalesByCurrency),
        totalPaid: amountForSingleCurrency(totalPaidByCurrency),
        totalReturned: amountForSingleCurrency(totalReturnedByCurrency),
        totalSalesByCurrency,
        totalPaidByCurrency,
        totalReturnedByCurrency,
        grossProfitCurrency: 'UZS',
        balancesByCurrency,
        customerAdvancesByCurrency,
        totalCogs,
        grossProfit,
      },
      invoices,
      returns,
      payments,
    };
  }
}

function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
