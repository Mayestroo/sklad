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
  SalesDocStatus,
  SalesPaymentStatus,
  SalesReturnStatus,
  SalesReturnDocStatus,
} from '@prisma/client';

@Injectable()
export class SalesInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── NUMBER GENERATORS ─────────────────────────────────────────

  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const count = await this.prisma.salesInvoice.count({
      where: { tenantId, invoiceNumber: { startsWith: prefix } },
    });
    return `${prefix}${(count + 1).toString().padStart(4, '0')}`;
  }

  private async generateReturnNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SRET-${year}-`;
    const count = await this.prisma.salesReturn.count({
      where: { tenantId, returnNumber: { startsWith: prefix } },
    });
    return `${prefix}${(count + 1).toString().padStart(4, '0')}`;
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

  // ─── CREATE (DRAFT) ───────────────────────────────────────────

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

    const invoiceNumber = await this.generateInvoiceNumber(tenantId);
    const exchangeRate = dto.exchangeRate || 1;

    let subtotalAmount = 0;
    let discountAmount = 0;
    let vatAmount = 0;

    const preparedItems = dto.items.map((item) => {
      const qty = item.quantity;
      const unitPrice = item.unitPrice;
      const disc = item.discount || 0;
      const vatRate = item.vatRate || 0;

      const lineSubtotal = qty * unitPrice;
      const lineAfterDisc = Math.max(0, lineSubtotal - disc);
      const lineVat = (lineAfterDisc * vatRate) / 100;
      const lineTotal = lineAfterDisc + lineVat;

      subtotalAmount += lineSubtotal;
      discountAmount += disc;
      vatAmount += lineVat;

      return {
        productId: item.productId,
        quantity: qty,
        unitPrice,
        discount: disc,
        vatRate,
        vatAmount: lineVat,
        totalPrice: lineTotal,
        unitCogs: 0,
        lineCogs: 0,
        lineGrossProfit: 0,
        isBelowCost: false,
      };
    });

    const totalAmount = subtotalAmount - discountAmount + vatAmount;

    const invoice = await this.prisma.salesInvoice.create({
      data: {
        tenantId,
        invoiceNumber,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
        counterpartyId: dto.counterpartyId,
        warehouseId: dto.warehouseId,
        currency: dto.currency || 'UZS',
        exchangeRate,
        contractNumber: dto.contractNumber || null,
        contractDate: dto.contractDate ? new Date(dto.contractDate) : null,
        paymentTerms: dto.paymentTerms || null,
        comment: dto.comment || null,
        priceListId: dto.priceListId || null,
        status: SalesDocStatus.DRAFT,
        paymentStatus: SalesPaymentStatus.UNPAID,
        returnStatus: SalesReturnStatus.NONE,
        subtotalAmount,
        discountAmount,
        vatAmount,
        totalAmount,
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
          const fallbackCost = Number(product?.costPrice || 0);
          totalItemCogs += remainingToConsume * fallbackCost;
        }

        const unitCogs = qty > 0 ? totalItemCogs / qty : 0;
        const lineCogs = totalItemCogs;
        const lineTotal = Number(item.totalPrice);
        const lineVat = Number(item.vatAmount || 0);
        const lineNetRevenue = lineTotal - lineVat;
        const lineGrossProfit = lineNetRevenue - lineCogs;
        const isBelowCost = Number(item.unitPrice) < unitCogs;

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

      const netRevenue = Number(invoice.totalAmount) - Number(invoice.vatAmount);
      const grossProfit = netRevenue - totalCogs;

      // 3. Increase customer (debitor) debt
      await tx.counterparty.update({
        where: { id: invoice.counterpartyId },
        data: { debtBalance: { increment: invoice.totalAmount } },
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
        const netRevenue =
          Number(invoice.totalAmount) - Number(invoice.vatAmount);
        const vatSum = Number(invoice.vatAmount);
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

      // Reduce customer debt
      await tx.counterparty.update({
        where: { id: invoice.counterpartyId },
        data: { debtBalance: { decrement: invoice.totalAmount } },
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
    if (invoice.status !== SalesDocStatus.DRAFT) {
      throw new BadRequestException(
        "Faqat qoralama holatdagi hujjatlarni o'chirish mumkin",
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
        unitPrice: Number(item.unitPrice),
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

    const returnNumber = await this.generateReturnNumber(tenantId);
    let totalAmount = 0;
    let totalCogs = 0;

    let originalInvoice: any = null;
    const returnedQtyMap = new Map<string, number>();

    if (dto.invoiceId) {
      originalInvoice =
        (await this.prisma.salesInvoice.findFirst({
          where: { id: dto.invoiceId, tenantId },
          include: {
            items: true,
            returns: {
              where: { status: SalesReturnDocStatus.POSTED },
              include: { items: true },
            },
          },
        })) ||
        (await this.prisma.salesInvoice.findUnique({
          where: { id: dto.invoiceId },
          include: {
            items: true,
            returns: {
              where: { status: SalesReturnDocStatus.POSTED },
              include: { items: true },
            },
          },
        }));
      if (!originalInvoice) {
        throw new NotFoundException('Tanlangan sotuv fakturasi topilmadi');
      }

      for (const ret of originalInvoice.returns || []) {
        for (const retItem of ret.items || []) {
          const current = returnedQtyMap.get(retItem.productId) || 0;
          returnedQtyMap.set(retItem.productId, current + Number(retItem.quantity));
        }
      }
    }

    const preparedItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      unitCogs: number;
      lineCogs: number;
      isDefective: boolean;
    }> = [];

    for (const i of dto.items) {
      const lineTotal = i.quantity * i.unitPrice;
      totalAmount += lineTotal;

      let unitCogs = 0;
      if (originalInvoice) {
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

        if (i.quantity > remainingReturnable + 0.0001) {
          throw new BadRequestException(
            `"${origItem.productId}" bo'yicha qaytarish miqdori (${i.quantity}) asl sotuvdagi qoldiqdan (${remainingReturnable}) oshib ketdi (Over-return invariant)`,
          );
        }

        unitCogs = Number(origItem.unitCogs || 0);
      }

      if (unitCogs <= 0) {
        const prod = await this.prisma.product.findUnique({
          where: { id: i.productId },
        });
        unitCogs = Number(prod?.costPrice || 0);
      }

      const lineCogs = i.quantity * unitCogs;
      totalCogs += lineCogs;

      preparedItems.push({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
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
          currency: dto.currency || 'UZS',
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
      currency: dto.currency || 'UZS',
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

      // Reduce customer debt
      await tx.counterparty.update({
        where: { id: params.counterpartyId },
        data: { debtBalance: { decrement: params.totalAmount } },
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

      if (revenueAcc && receivableAcc && params.totalAmount > 0) {
        journalLines.push({
          debitAccountId: revenueAcc.id,
          creditAccountId: receivableAcc.id,
          amount: params.totalAmount,
          description: `Sotuv qaytarilishi № ${params.returnNumber}`,
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

      // Reverse customer debt
      await tx.counterparty.update({
        where: { id: existing.counterpartyId },
        data: { debtBalance: { increment: Number(existing.totalAmount) } },
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
      currency?: string;
      isDefault?: boolean;
    },
  ) {
    return this.prisma.priceList.create({
      data: {
        tenantId,
        name: data.name,
        currency: data.currency || 'UZS',
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

  // ─── SUMMARY STATS ────────────────────────────────────────────

  async getSummaryStats(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlySales = await this.prisma.salesInvoice.aggregate({
      where: {
        tenantId,
        status: SalesDocStatus.POSTED,
        invoiceDate: { gte: startOfMonth },
      },
      _sum: { totalAmount: true, totalCogs: true, grossProfit: true },
      _count: { id: true },
    });

    const monthlyReturns = await this.prisma.salesReturn.aggregate({
      where: { tenantId, returnDate: { gte: startOfMonth } },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    const customerDebt = await this.prisma.counterparty.aggregate({
      where: {
        tenantId,
        type: { in: ['CUSTOMER', 'BOTH'] },
        debtBalance: { gt: 0 },
      },
      _sum: { debtBalance: true },
      _count: { id: true },
    });

    const totalSales = Number(monthlySales._sum.totalAmount || 0);
    const totalCogs = Number(monthlySales._sum.totalCogs || 0);
    const grossProfit = Number(monthlySales._sum.grossProfit || 0);
    const margin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

    return {
      monthlySalesTotal: totalSales,
      monthlySalesCount: monthlySales._count.id,
      monthlyCogsTotal: totalCogs,
      monthlyGrossProfit: grossProfit,
      monthlyGrossProfitMargin: Math.round(margin * 100) / 100,
      totalCustomerDebt: Number(customerDebt._sum.debtBalance || 0),
      customersWithDebtCount: customerDebt._count.id,
      monthlyReturnsTotal: Number(monthlyReturns._sum.totalAmount || 0),
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
      orderBy: { returnDate: 'desc' },
    });

    const payments = await this.prisma.financeTransaction.findMany({
      where: { tenantId, counterpartyId: customerId, direction: 'INCOME' },
      include: { account: true },
      orderBy: { transactionDate: 'desc' },
    });

    const totalSales = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalReturned = returns.reduce(
      (s, r) => s + Number(r.totalAmount),
      0,
    );
    const totalCogs = invoices.reduce((s, i) => s + Number(i.totalCogs), 0);
    const grossProfit = invoices.reduce((s, i) => s + Number(i.grossProfit), 0);

    return {
      customer,
      metrics: {
        totalSales,
        totalPaid,
        totalReturned,
        debtBalance: Number(customer.debtBalance),
        totalCogs,
        grossProfit,
      },
      invoices,
      returns,
      payments,
    };
  }
}
