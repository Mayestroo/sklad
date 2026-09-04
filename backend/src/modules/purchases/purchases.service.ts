import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { CreatePurchaseReceiptDto } from './dto/create-purchase-receipt.dto';
import { FilterPurchaseReceiptsDto } from './dto/filter-purchase-receipts.dto';
import {
  CreatePurchaseExpenseDto,
  ExpenseAllocationMethodDto,
} from './dto/create-purchase-expense.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import {
  Prisma,
  PurchaseDocStatus,
  PurchasePaymentStatus,
  PurchaseReturnStatus,
  ReturnDocStatus,
  ExpenseAllocationMethod,
  ExpenseType,
  TransactionDirection,
} from '@prisma/client';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── RECEIPT NUMBER GENERATOR ─────────────────────────────────

  private async generateDocNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PUR-${year}-`;
    const count = await this.prisma.purchaseReceipt.count({
      where: {
        tenantId,
        docNumber: { startsWith: prefix },
      },
    });
    const nextNum = (count + 1).toString().padStart(4, '0');
    return `${prefix}${nextNum}`;
  }

  private async generateReturnNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PRET-${year}-`;
    const count = await this.prisma.purchaseReturn.count({
      where: {
        tenantId,
        returnNumber: { startsWith: prefix },
      },
    });
    const nextNum = (count + 1).toString().padStart(4, '0');
    return `${prefix}${nextNum}`;
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

    const docNumber = await this.generateDocNumber(tenantId);
    const exchangeRate = dto.exchangeRate || 1;

    let subtotalAmount = 0;
    let discountAmount = 0;
    let vatAmount = 0;

    const preparedItems = dto.items.map((item) => {
      const qty = item.quantity;
      const weight = item.weight || 0;
      const unitPrice = item.unitPrice;
      const disc = item.discount || 0;
      const vatRate = item.vatRate || 0;

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
        currency: dto.currency || 'UZS',
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

    const exchangeRate = dto.exchangeRate || existing.exchangeRate;

    let subtotalAmount = 0;
    let discountAmount = 0;
    let vatAmount = 0;

    const preparedItems = dto.items.map((item) => {
      const qty = item.quantity;
      const weight = item.weight || 0;
      const unitPrice = item.unitPrice;
      const disc = item.discount || 0;
      const vatRate = item.vatRate || 0;

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
      await tx.purchaseReceiptItem.deleteMany({
        where: { receiptId: id },
      });

      return tx.purchaseReceipt.update({
        where: { id },
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
            where: { id: stockLevel.id },
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
            purchasePrice: item.unitPrice,
            landedCost: item.landedCost,
          },
        });
      }

      // 2. Increase supplier debt
      await tx.counterparty.update({
        where: { id: receipt.counterpartyId },
        data: {
          debtBalance: { increment: receipt.totalAmount },
        },
      });

      // 3. Accounting journal entries according to BHMS / NAS Standard
      // Debit 2910 (Finished Goods / Tovarlar): Net product cost + allocated expenses
      // Debit 1010 (Raw Materials & Supplies / Xomashyo): Net raw material cost + allocated expenses
      // Debit 9420/9430 (Operating Expense / Xizmat xarajatlari): Service costs
      // Debit 4410 (Input VAT / Kiruvchi QQS): VAT amount
      // Credit 6010 (Accounts Payable / Yetkazib beruvchiga qarz): Total Amount
      const entryCount = await tx.journalEntry.count({ where: { tenantId } });
      const entryNumber = `JE-${new Date().getFullYear()}-${(entryCount + 1).toString().padStart(5, '0')}`;

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

        const totalNet =
          Number(receipt.subtotalAmount || 0) -
          Number(receipt.discountAmount || 0) +
          Number(receipt.additionalExpensesTotal || 0);

        const hasSpecialTypes = receipt.items.some(
          (i: any) =>
            i.product?.type === 'RAW_MATERIAL' || i.product?.type === 'SERVICE',
        );

        if (!hasSpecialTypes) {
          productSum = totalNet;
        } else {
          for (const item of receipt.items) {
            const lineTotal =
              item.totalPrice !== undefined
                ? Number(item.totalPrice)
                : Number(item.quantity || 0) * Number(item.unitPrice || 0);
            const allocated = Number(item.allocatedExpenses || 0);
            const itemNet = lineTotal + allocated;
            const itemType = item.product?.type || 'PRODUCT';

            if (itemType === 'RAW_MATERIAL') {
              rawMaterialSum += itemNet;
            } else if (itemType === 'SERVICE') {
              serviceSum += lineTotal;
            } else {
              productSum += itemNet;
            }
          }
        }

        const vatSum = Number(receipt.vatAmount);
        const journalLines: any[] = [];

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
          await tx.journalEntry.create({
            data: {
              tenantId,
              entryNumber,
              entryDate: receipt.docDate,
              description: `Nomenklatura qabul qilish № ${receipt.docNumber} (${receipt.counterparty.name})`,
              sourceDocType: 'PurchaseReceipt',
              sourceDocId: receipt.id,
              lines: {
                create: journalLines,
              },
            },
          });
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
        where: { id: receipt.id },
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
        items: true,
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
        `Ushbu xarid hujjati bo'yicha to'lovlar kiritilgan (To'langan: ${receipt.paidAmount} ${receipt.currency}). Hujjatni bekor qilishdan avval Moliya modulida unga bog'liq to'lovlarni o'chiring.`,
      );
    }

    if (receipt.returnStatus !== PurchaseReturnStatus.NONE) {
      throw new BadRequestException(
        "Ushbu xarid hujjati bo'yicha to'liq yoki qisman qaytarish rasmiylashtirilgan. Avval qaytaruv hujjatlarini o'chiring.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Decrement stock levels & delete batches
      for (const item of receipt.items) {
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
          const newQty = Math.max(
            0,
            Number(stockLevel.quantity) - Number(item.quantity),
          );
          await tx.stockLevel.update({
            where: { id: stockLevel.id },
            data: { quantity: newQty },
          });
        }
      }

      await tx.productBatch.deleteMany({
        where: { receiptId: id },
      });

      // 2. Reduce supplier debt
      await tx.counterparty.update({
        where: { id: receipt.counterpartyId },
        data: {
          debtBalance: { decrement: receipt.totalAmount },
        },
      });

      // 3. Remove journal entries
      await tx.journalEntry.deleteMany({
        where: { tenantId, sourceDocType: 'PurchaseReceipt', sourceDocId: id },
      });

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
        where: { id },
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

    if (cashAccount.currency !== receipt.currency) {
      throw new BadRequestException(
        `Kassa valyutasi (${cashAccount.currency}) hujjat valyutasiga (${receipt.currency}) mos kelmaydi. To'lov faqat ${receipt.currency} kassasidan amalga oshirilishi mumkin.`,
      );
    }

    if (Number(cashAccount.balance) < dto.amount) {
      throw new BadRequestException(
        `Kassada mablag' yetarli emas. Mavjud: ${cashAccount.balance} ${cashAccount.currency}, To'lov: ${dto.amount} ${receipt.currency}`,
      );
    }

    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();
    const remaining = Number(receipt.totalAmount) - Number(receipt.paidAmount);
    const payAmount = Math.min(dto.amount, remaining);

    if (payAmount <= 0) {
      throw new BadRequestException("To'lov summasi noto'g'ri");
    }

    return this.prisma.$transaction(async (tx) => {
      const newPaidAmount = Number(receipt.paidAmount) + payAmount;
      const newPaymentStatus =
        newPaidAmount >= Number(receipt.totalAmount)
          ? PurchasePaymentStatus.PAID
          : PurchasePaymentStatus.PARTIALLY_PAID;

      // 1. Update receipt paidAmount and paymentStatus
      const updatedReceipt = await tx.purchaseReceipt.update({
        where: { id },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: newPaymentStatus,
        },
        include: { counterparty: true, warehouse: true },
      });

      // 2. Decrement CashAccount balance
      await tx.cashAccount.update({
        where: { id: dto.cashAccountId },
        data: { balance: { decrement: payAmount } },
      });

      // 3. Decrease counterparty debt
      await tx.counterparty.update({
        where: { id: receipt.counterpartyId },
        data: { debtBalance: { decrement: payAmount } },
      });

      // 4. Create Finance Transaction (EXPENSE)
      const txCount = await tx.financeTransaction.count({
        where: { tenantId },
      });
      const txNumber = `FT-${new Date().getFullYear()}-${(txCount + 1).toString().padStart(5, '0')}`;

      await tx.financeTransaction.create({
        data: {
          tenantId,
          docNumber: txNumber,
          direction: TransactionDirection.EXPENSE,
          amount: payAmount,
          currency: cashAccount.currency,
          transactionDate: paymentDate,
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

      // 5. Accounting Journal: Debit 6010 (Yetkazib beruvchiga qarz) / Credit 5010 (Kassa)
      const supplierAcc = await tx.account.findFirst({
        where: { tenantId, code: '6010' },
      });
      const cashAcc = await tx.account.findFirst({
        where: { tenantId, code: '5010' },
      });

      if (supplierAcc && cashAcc) {
        const jeCount = await tx.journalEntry.count({ where: { tenantId } });
        const jeNumber = `JE-${new Date().getFullYear()}-${(jeCount + 1).toString().padStart(5, '0')}`;

        await tx.journalEntry.create({
          data: {
            tenantId,
            entryNumber: jeNumber,
            entryDate: paymentDate,
            description: `To'lov: ${receipt.docNumber} — ${receipt.counterparty.name}`,
            sourceDocType: 'PurchasePayment',
            sourceDocId: receipt.id,
            lines: {
              create: [
                {
                  debitAccountId: supplierAcc.id,
                  creditAccountId: cashAcc.id,
                  amount: payAmount,
                  description:
                    'Yetkazib beruvchi qarzi kamaymasi / Kassadan chiqim',
                },
              ],
            },
          },
        });
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

    if (receipt.status !== PurchaseDocStatus.DRAFT) {
      throw new BadRequestException(
        "Faqat qoralama holatidagi xarid hujjatlarini o'chirish mumkin",
      );
    }

    await this.prisma.purchaseReceipt.delete({
      where: { id },
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

    return this.prisma.$transaction(async (tx) => {
      // Create expense
      const expense = await tx.purchaseExpense.create({
        data: {
          tenantId,
          receiptId: dto.receiptId,
          expenseType: dto.expenseType,
          supplierId: dto.supplierId || null,
          amount: dto.amount,
          currency: dto.currency || 'UZS',
          allocationMethod: allocationMethod,
          comment: dto.comment || null,
        },
      });

      // Recalculate total additional expenses for this receipt
      const allExpenses = await tx.purchaseExpense.findMany({
        where: { receiptId: dto.receiptId },
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
          where: { id: item.id },
          data: {
            allocatedExpenses: allocatedForItem,
            landedCost: newLandedCost,
          },
        });

        // Update product batch landed cost if created
        if (receipt.status === PurchaseDocStatus.POSTED) {
          await tx.productBatch.updateMany({
            where: { receiptId: receipt.id, productId: item.productId },
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
        where: { id: receipt.id },
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

    const returnNumber = await this.generateReturnNumber(tenantId);
    let totalAmount = 0;
    const targetStatus = dto.status || ReturnDocStatus.POSTED;

    // Validate receipt & items if receiptId is linked
    let receipt: any = null;
    if (dto.receiptId) {
      receipt = await this.prisma.purchaseReceipt.findUnique({
        where: { id: dto.receiptId },
        include: {
          items: { include: { product: true } },
          batches: true,
          returns: true,
        },
      });

      if (!receipt) {
        throw new NotFoundException("Biriktirilgan xarid hujjati topilmadi");
      }

      if (receipt.status !== PurchaseDocStatus.POSTED) {
        throw new BadRequestException(
          "Faqat tasdiqlangan (POSTED) xaridlar bo'yicha qaytarish yaratish mumkin",
        );
      }
    }

    const preparedItems = dto.items.map((i) => {
      const lineTotal = i.quantity * i.unitPrice;
      totalAmount += lineTotal;
      return {
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: lineTotal,
      };
    });

    return this.prisma.$transaction(async (tx) => {
      // Validate inventory & batch constraints if posting immediately
      if (targetStatus === ReturnDocStatus.POSTED && receipt) {
        for (const item of dto.items) {
          const receiptItem = receipt.items.find(
            (ri: any) => ri.productId === item.productId,
          );
          if (!receiptItem) {
            throw new BadRequestException(
              `Tovar #${item.productId} ushbu xarid tarkibida mavjud emas`,
            );
          }

          if (receiptItem.product?.type === 'SERVICE') {
            throw new BadRequestException(
              `Xizmat (SERVICE) turidagi pozitsiyalarni ombordan qaytarish taqiqlanadi`,
            );
          }

          const unreturnedQty =
            Number(receiptItem.quantity) - Number(receiptItem.returnedQuantity || 0);
          if (item.quantity > unreturnedQty) {
            throw new BadRequestException(
              `Qaytariladigan miqdor (${item.quantity}) ushbu xariddan qolgan qaytarilmagan miqdordan (${unreturnedQty}) oshishi mumkin emas`,
            );
          }

          // Check product batch
          const batch = receipt.batches.find(
            (b: any) => b.productId === item.productId,
          );
          if (batch && item.quantity > Number(batch.remainingQty)) {
            throw new BadRequestException(
              `Qaytariladigan miqdor (${item.quantity}) partiyada qolgan miqdordan (${batch.remainingQty}) oshishi mumkin emas. Sotib yuborilgan tovarni qaytarish taqiqlanadi.`,
            );
          }

          // Check warehouse stock
          const stockLevel = await tx.stockLevel.findUnique({
            where: {
              tenantId_warehouseId_productId: {
                tenantId,
                warehouseId: dto.warehouseId,
                productId: item.productId,
              },
            },
          });
          const availableStock = stockLevel ? Number(stockLevel.quantity) : 0;
          if (item.quantity > availableStock) {
            throw new BadRequestException(
              `Qaytariladigan miqdor (${item.quantity}) omborda mavjud qoldiqdan (${availableStock}) oshishi mumkin emas`,
            );
          }
        }
      }

      const pReturn = await tx.purchaseReturn.create({
        data: {
          tenantId,
          returnNumber,
          returnDate: dto.returnDate ? new Date(dto.returnDate) : new Date(),
          receiptId: dto.receiptId || null,
          counterpartyId: dto.counterpartyId,
          warehouseId: dto.warehouseId,
          currency: dto.currency || 'UZS',
          reason: dto.reason || null,
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
          receipt: true,
          items: { include: { product: true } },
        },
      });

      // If created directly in POSTED status, execute posting inventory & financial movements
      if (targetStatus === ReturnDocStatus.POSTED) {
        let totalLandedCostReduction = 0;
        let basePurchaseTotalReduction = 0;

        for (const item of dto.items) {
          // 1. Decrement warehouse stock
          const stockLevel = await tx.stockLevel.findUnique({
            where: {
              tenantId_warehouseId_productId: {
                tenantId,
                warehouseId: dto.warehouseId,
                productId: item.productId,
              },
            },
          });

          if (stockLevel) {
            const newQty = Math.max(
              0,
              Number(stockLevel.quantity) - item.quantity,
            );
            await tx.stockLevel.update({
              where: { id: stockLevel.id },
              data: { quantity: newQty },
            });
          }

          // 2. Decrement ProductBatch remainingQty and calculate Landed Cost Variance (ADR 0009)
          if (receipt) {
            const receiptItem = receipt.items.find(
              (ri: any) => ri.productId === item.productId,
            );
            const unitLandedCost =
              receiptItem && Number(receiptItem.quantity) > 0 && Number(receiptItem.landedCost) > 0
                ? Number(receiptItem.landedCost) / Number(receiptItem.quantity)
                : item.unitPrice;

            totalLandedCostReduction += item.quantity * unitLandedCost;
            basePurchaseTotalReduction += item.quantity * item.unitPrice;

            // Update receipt item returnedQuantity
            if (receiptItem) {
              await tx.purchaseReceiptItem.update({
                where: { id: receiptItem.id },
                data: {
                  returnedQuantity: { increment: item.quantity },
                },
              });
            }

            // Update ProductBatch remainingQty
            const batch = receipt.batches.find(
              (b: any) => b.productId === item.productId,
            );
            if (batch) {
              const newBatchQty = Math.max(
                0,
                Number(batch.remainingQty) - item.quantity,
              );
              await tx.productBatch.update({
                where: { id: batch.id },
                data: { remainingQty: newBatchQty },
              });
            }
          } else {
            basePurchaseTotalReduction += item.quantity * item.unitPrice;
          }
        }

        // 3. Reduce supplier debt (Credit 6010 debit) by base purchase total
        await tx.counterparty.update({
          where: { id: dto.counterpartyId },
          data: {
            debtBalance: { decrement: basePurchaseTotalReduction },
          },
        });

        // 4. Update main receipt returnStatus if linked
        if (dto.receiptId && receipt) {
          const updatedItems = await tx.purchaseReceiptItem.findMany({
            where: { receiptId: dto.receiptId },
          });

          const allFullyReturned = updatedItems.every(
            (ri) => Number(ri.returnedQuantity) >= Number(ri.quantity),
          );
          const returnStatus = allFullyReturned
            ? PurchaseReturnStatus.FULLY_RETURNED
            : PurchaseReturnStatus.PARTIALLY_RETURNED;

          await tx.purchaseReceipt.update({
            where: { id: dto.receiptId },
            data: { returnStatus },
          });
        }
      }

      // 5. Audit Log
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

  async cancelReturn(tenantId: string, userId: string, returnId: string) {
    const pReturn = await this.prisma.purchaseReturn.findFirst({
      where: { id: returnId, tenantId },
      include: { items: true, receipt: { include: { items: true, batches: true } } },
    });

    if (!pReturn) {
      throw new NotFoundException('Qaytarish hujjati topilmadi');
    }

    if (pReturn.status === ReturnDocStatus.CANCELLED) {
      throw new BadRequestException('Ushbu hujjat allaqachon bekor qilingan');
    }

    return this.prisma.$transaction(async (tx) => {
      // If the document was POSTED, reverse stock, batch, debt, and receipt items
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
              where: { id: stockLevel.id },
              data: { quantity: { increment: qty } },
            });
          }

          // 2. Re-increment ProductBatch remainingQty and decrement PurchaseReceiptItem returnedQuantity
          if (pReturn.receipt) {
            const receiptItem = pReturn.receipt.items.find(
              (ri) => ri.productId === item.productId,
            );
            if (receiptItem) {
              await tx.purchaseReceiptItem.update({
                where: { id: receiptItem.id },
                data: {
                  returnedQuantity: {
                    decrement: Math.min(qty, Number(receiptItem.returnedQuantity)),
                  },
                },
              });
            }

            const batch = pReturn.receipt.batches.find(
              (b) => b.productId === item.productId,
            );
            if (batch) {
              await tx.productBatch.update({
                where: { id: batch.id },
                data: { remainingQty: { increment: qty } },
              });
            }
          }
        }

        // 3. Re-increase supplier debt (undo debt decrement)
        await tx.counterparty.update({
          where: { id: pReturn.counterpartyId },
          data: {
            debtBalance: { increment: basePurchaseTotal },
          },
        });

        // 4. Update receipt returnStatus
        if (pReturn.receiptId) {
          const updatedItems = await tx.purchaseReceiptItem.findMany({
            where: { receiptId: pReturn.receiptId },
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
            where: { id: pReturn.receiptId },
            data: { returnStatus },
          });
        }
      }

      // Update status to CANCELLED
      const updatedReturn = await tx.purchaseReturn.update({
        where: { id: returnId },
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

  async findAllReturns(tenantId: string) {
    return this.prisma.purchaseReturn.findMany({
      where: { tenantId },
      include: {
        counterparty: true,
        warehouse: true,
        receipt: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
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

    return {
      supplier,
      metrics: {
        totalPurchased,
        totalPaid,
        totalReturned,
        debtBalance: Number(supplier.debtBalance),
      },
      receipts,
      returns,
      payments,
    };
  }

  async getSummaryStats(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyReceipts = await this.prisma.purchaseReceipt.aggregate({
      where: {
        tenantId,
        docDate: { gte: startOfMonth },
        status: PurchaseDocStatus.POSTED,
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    const suppliersWithDebt = await this.prisma.counterparty.aggregate({
      where: {
        tenantId,
        type: { in: ['SUPPLIER', 'BOTH'] },
        debtBalance: { gt: 0 },
      },
      _sum: { debtBalance: true },
      _count: { id: true },
    });

    const monthlyReturns = await this.prisma.purchaseReturn.aggregate({
      where: {
        tenantId,
        returnDate: { gte: startOfMonth },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    const activeSuppliers = await this.prisma.counterparty.count({
      where: {
        tenantId,
        type: { in: ['SUPPLIER', 'BOTH'] },
      },
    });

    return {
      monthlyPurchasesTotal: Number(monthlyReceipts._sum.totalAmount || 0),
      monthlyPurchasesCount: monthlyReceipts._count.id,
      totalSupplierDebt: Number(suppliersWithDebt._sum.debtBalance || 0),
      suppliersWithDebtCount: suppliersWithDebt._count.id,
      monthlyReturnsTotal: Number(monthlyReturns._sum.totalAmount || 0),
      monthlyReturnsCount: monthlyReturns._count.id,
      activeSuppliersCount: activeSuppliers,
    };
  }
}
