import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  OpeningBalanceStatus,
  OpeningBalanceCategory,
  TransactionDirection,
  TransactionStatus,
  AccountType,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateOpeningBalanceDto } from './dto/create-opening-balance.dto';
import { UpdateOpeningBalanceLinesDto } from './dto/update-opening-balance.dto';
import { OpeningBalanceLineDto } from './dto/opening-balance-line.dto';
import { UnpostOpeningBalanceDto } from './dto/unpost-opening-balance.dto';

@Injectable()
export class OpeningBalancesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Calculation Helper ──────────────────────────────────────────

  private calculateMetrics(lines: Array<{ category: OpeningBalanceCategory; amount: number; netAmount?: number; accumulatedDepreciation?: number }>) {
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    const categoryBreakdown: Record<string, number> = {};

    for (const cat of Object.values(OpeningBalanceCategory)) {
      categoryBreakdown[cat] = 0;
    }

    for (const line of lines) {
      const amt = Number(line.amount || 0);
      categoryBreakdown[line.category] = (categoryBreakdown[line.category] || 0) + amt;

      switch (line.category) {
        case OpeningBalanceCategory.CASH:
        case OpeningBalanceCategory.BANK:
        case OpeningBalanceCategory.INVENTORY:
        case OpeningBalanceCategory.CUSTOMER_DEBT:
        case OpeningBalanceCategory.SUPPLIER_ADVANCE:
        case OpeningBalanceCategory.OTHER_ASSET:
          totalAssets += amt;
          break;
        case OpeningBalanceCategory.FIXED_ASSET: {
          const net = line.netAmount !== undefined && line.netAmount !== null
            ? Number(line.netAmount)
            : Math.max(0, amt - Number(line.accumulatedDepreciation || 0));
          totalAssets += net;
          break;
        }
        case OpeningBalanceCategory.SUPPLIER_DEBT:
        case OpeningBalanceCategory.CUSTOMER_ADVANCE:
        case OpeningBalanceCategory.OTHER_LIABILITY:
          totalLiabilities += amt;
          break;
        case OpeningBalanceCategory.EQUITY:
          totalEquity += amt;
          break;
      }
    }

    const suggestedEquity = Math.max(0, totalAssets - totalLiabilities);
    const balanceDifference = totalAssets - (totalLiabilities + totalEquity);
    const isBalanced = Math.abs(balanceDifference) < 0.01;

    return {
      totalAssets: Math.round(totalAssets * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      totalEquity: Math.round(totalEquity * 100) / 100,
      suggestedEquity: Math.round(suggestedEquity * 100) / 100,
      balanceDifference: Math.round(balanceDifference * 100) / 100,
      isBalanced,
      categoryBreakdown,
    };
  }

  // ─── Query Methods ───────────────────────────────────────────────

  async findAll(tenantId: string) {
    return this.prisma.openingBalanceDocument.findMany({
      where: { tenantId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { lines: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const doc = await this.prisma.openingBalanceDocument.findFirst({
      where: { id, tenantId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        lines: {
          include: {
            account: {
              select: {
                id: true,
                accountType: true,
                name: true,
                currency: true,
                balance: true,
              },
            },
            product: {
              select: { id: true, sku: true, name: true, unitOfMeasure: true },
            },
            warehouse: {
              select: { id: true, name: true },
            },
            counterparty: {
              select: { id: true, name: true, type: true, inn: true, phone: true },
            },
            fixedAsset: {
              select: {
                id: true,
                name: true,
                inventoryNumber: true,
                assetType: true,
                netBookValue: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!doc) throw new NotFoundException('Boshlang‘ich qoldiq hujjati topilmadi');

    const lines = (doc as any).lines || [];
    const metrics = this.calculateMetrics(
      lines.map((l: any) => ({
        category: l.category,
        amount: Number(l.amount),
        netAmount: Number(l.netAmount),
        accumulatedDepreciation: Number(l.accumulatedDepreciation || 0),
      })),
    );

    return {
      ...doc,
      metrics,
    };
  }

  // ─── Document Creation ───────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateOpeningBalanceDto) {
    let docNumber = dto.docNumber;
    if (!docNumber) {
      const count = await this.prisma.openingBalanceDocument.count({ where: { tenantId } });
      const year = new Date(dto.openingDate).getFullYear();
      docNumber = `OB-${year}-${String(count + 1).padStart(4, '0')}`;
    }

    const existing = await this.prisma.openingBalanceDocument.findFirst({
      where: { tenantId, docNumber },
    });
    if (existing) {
      throw new ConflictException(`Hujjat raqami ${docNumber} allaqachon mavjud`);
    }

    const lines = dto.lines || [];
    const metrics = this.calculateMetrics(
      lines.map((l) => ({
        category: l.category,
        amount: Number(l.amount || 0),
        netAmount: Number(l.netAmount || l.amount || 0),
        accumulatedDepreciation: Number(l.accumulatedDepreciation || 0),
      })),
    );

    return this.prisma.openingBalanceDocument.create({
      data: {
        tenantId,
        docNumber,
        openingDate: new Date(dto.openingDate),
        status: OpeningBalanceStatus.DRAFT,
        notes: dto.notes || null,
        createdById: userId,
        totalAssets: metrics.totalAssets,
        totalLiabilities: metrics.totalLiabilities,
        totalEquity: metrics.totalEquity,
        balanceDifference: metrics.balanceDifference,
        lines: {
          create: lines.map((l) => {
            const amt = Number(l.amount || 0);
            const accDep = Number(l.accumulatedDepreciation || 0);
            const netAmt = l.category === OpeningBalanceCategory.FIXED_ASSET
              ? Math.max(0, amt - accDep)
              : amt;
            return {
              tenantId,
              category: l.category,
              accountId: l.accountId || null,
              productId: l.productId || null,
              warehouseId: l.warehouseId || null,
              counterpartyId: l.counterpartyId || null,
              fixedAssetId: l.fixedAssetId || null,
              quantity: l.quantity !== undefined && l.quantity !== null ? Number(l.quantity) : null,
              unitCost: l.unitCost !== undefined && l.unitCost !== null ? Number(l.unitCost) : null,
              amount: amt,
              accumulatedDepreciation: accDep,
              netAmount: netAmt,
              currency: l.currency,
              exchangeRate: Number(l.exchangeRate || 1.0),
              batchNumber: l.batchNumber || null,
              contractNumber: l.contractNumber || null,
              notes: l.notes || null,
            };
          }),
        },
      },
      include: {
        lines: true,
      },
    });
  }

  // ─── Update Lines ────────────────────────────────────────────────

  async updateLines(
    tenantId: string,
    documentId: string,
    dto: UpdateOpeningBalanceLinesDto,
  ) {
    const doc = await this.prisma.openingBalanceDocument.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');

    if (doc.status === OpeningBalanceStatus.POSTED) {
      throw new BadRequestException(
        'Tasdiqlangan boshlang‘ich qoldiq hujjatini to‘g‘ridan-to‘g‘ri o‘zgartirib bo‘lmaydi. Avval qayta oching (Unpost)',
      );
    }

    const lines = dto.lines || [];
    const metrics = this.calculateMetrics(
      lines.map((l) => ({
        category: l.category,
        amount: Number(l.amount || 0),
        netAmount: Number(l.netAmount || l.amount || 0),
        accumulatedDepreciation: Number(l.accumulatedDepreciation || 0),
      })),
    );

    return this.prisma.$transaction(async (tx) => {
      // 1. Delete previous lines
      await tx.openingBalanceLine.deleteMany({
        where: { documentId, tenantId },
      });

      // 2. Insert new lines
      if (lines.length > 0) {
        await tx.openingBalanceLine.createMany({
          data: lines.map((l) => {
            const amt = Number(l.amount || 0);
            const accDep = Number(l.accumulatedDepreciation || 0);
            const netAmt = l.category === OpeningBalanceCategory.FIXED_ASSET
              ? Math.max(0, amt - accDep)
              : amt;
            return {
              documentId,
              tenantId,
              category: l.category,
              accountId: l.accountId || null,
              productId: l.productId || null,
              warehouseId: l.warehouseId || null,
              counterpartyId: l.counterpartyId || null,
              fixedAssetId: l.fixedAssetId || null,
              quantity: l.quantity !== undefined && l.quantity !== null ? Number(l.quantity) : null,
              unitCost: l.unitCost !== undefined && l.unitCost !== null ? Number(l.unitCost) : null,
              amount: amt,
              accumulatedDepreciation: accDep,
              netAmount: netAmt,
              currency: l.currency,
              exchangeRate: Number(l.exchangeRate || 1.0),
              batchNumber: l.batchNumber || null,
              contractNumber: l.contractNumber || null,
              notes: l.notes || null,
            };
          }),
        });
      }

      // 3. Update master document totals
      const updateData: any = {
        totalAssets: metrics.totalAssets,
        totalLiabilities: metrics.totalLiabilities,
        totalEquity: metrics.totalEquity,
        balanceDifference: metrics.balanceDifference,
        notes: dto.notes !== undefined ? dto.notes : doc.notes,
        updatedAt: new Date(),
      };
      if (dto.openingDate) {
        updateData.openingDate = new Date(dto.openingDate);
      }

      return tx.openingBalanceDocument.update({
        where: { id: documentId },
        data: updateData,
        include: { lines: true },
      });
    });
  }

  // ─── Status Transitions ──────────────────────────────────────────

  async submitForReview(tenantId: string, documentId: string) {
    const doc = await this.prisma.openingBalanceDocument.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');

    if (doc.status !== OpeningBalanceStatus.DRAFT) {
      throw new BadRequestException('Faqat qoralama holatidagi hujjat tekshirishga yuborilishi mumkin');
    }

    return this.prisma.openingBalanceDocument.update({
      where: { id: documentId },
      data: {
        status: OpeningBalanceStatus.PENDING_REVIEW,
        updatedAt: new Date(),
      },
    });
  }

  // ─── Document Posting (Post / Tasdiqlash) ─────────────────────────

  async post(tenantId: string, userId: string, documentId: string) {
    const doc = await this.prisma.openingBalanceDocument.findFirst({
      where: { id: documentId, tenantId },
      include: { lines: true },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');

    if (doc.status === OpeningBalanceStatus.POSTED) {
      throw new BadRequestException('Ushbu hujjat allaqachon tasdiqlangan');
    }

    // Verify balance equality
    const metrics = this.calculateMetrics(
      doc.lines.map((l) => ({
        category: l.category,
        amount: Number(l.amount),
        netAmount: Number(l.netAmount),
        accumulatedDepreciation: Number(l.accumulatedDepreciation || 0),
      })),
    );

    if (!metrics.isBalanced) {
      throw new BadRequestException(
        `Balans teng emas! Aktivlar (${metrics.totalAssets}) != Majburiyatlar (${metrics.totalLiabilities}) + Kapital (${metrics.totalEquity}). Farq: ${metrics.balanceDifference} so‘m. Boshlang‘ich balans farqi 0 bo‘lishi shart!`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Process Cash & Bank lines
      for (const line of doc.lines) {
        if (
          (line.category === OpeningBalanceCategory.CASH ||
            line.category === OpeningBalanceCategory.BANK) &&
          line.accountId
        ) {
          const amt = Number(line.amount);
          // Increment CashAccount balance
          await tx.cashAccount.update({
            where: { id: line.accountId },
            data: { balance: { increment: amt } },
          });

          // Create non-commercial FinanceTransaction
          await tx.financeTransaction.create({
            data: {
              tenantId,
              accountId: line.accountId,
              direction: TransactionDirection.INCOME,
              status: TransactionStatus.POSTED,
              amount: amt,
              currency: line.currency,
              comment: line.notes || `Boshlang‘ich qoldiq: ${doc.docNumber}`,
              sourceDocType: 'OpeningBalanceDocument',
              sourceDocId: doc.id,
              responsibleUserId: userId,
              createdById: userId,
            },
          });
        }
      }

      // 2. Process Inventory lines
      let itemIndex = 0;
      for (const line of doc.lines) {
        if (
          line.category === OpeningBalanceCategory.INVENTORY &&
          line.productId &&
          line.warehouseId
        ) {
          itemIndex++;
          const qty = Number(line.quantity || 0);
          const unitCost = Number(line.unitCost || 0);

          if (qty <= 0) continue;

          // Upsert StockLevel
          await tx.stockLevel.upsert({
            where: {
              tenantId_warehouseId_productId: {
                tenantId,
                warehouseId: line.warehouseId,
                productId: line.productId,
              },
            },
            create: {
              tenantId,
              warehouseId: line.warehouseId,
              productId: line.productId,
              quantity: qty,
            },
            update: {
              quantity: { increment: qty },
            },
          });

          // Create active ProductBatch with receiptId = null
          const batchNumber = line.batchNumber || `INIT-${doc.docNumber}-${itemIndex}`;
          await tx.productBatch.create({
            data: {
              tenantId,
              warehouseId: line.warehouseId,
              productId: line.productId,
              batchNumber,
              initialQty: qty,
              remainingQty: qty,
              purchasePrice: unitCost,
              landedCost: unitCost,
              receiptId: null,
            },
          });
        }
      }

      // 3. Process Customer Debt lines
      for (const line of doc.lines) {
        if (
          line.category === OpeningBalanceCategory.CUSTOMER_DEBT &&
          line.counterpartyId
        ) {
          const amt = Number(line.amount);
          await tx.counterparty.update({
            where: { id: line.counterpartyId },
            data: {
              customerDebt: { increment: amt },
              debtBalance: { increment: amt },
            },
          });
          await tx.counterpartyBalance.upsert({
            where: { counterpartyId_currency: { counterpartyId: line.counterpartyId, currency: line.currency } },
            create: { tenantId, counterpartyId: line.counterpartyId, currency: line.currency, customerDebt: amt },
            update: { customerDebt: { increment: amt } },
          });
        }
      }

      // 4. Process Supplier Debt lines
      for (const line of doc.lines) {
        if (
          line.category === OpeningBalanceCategory.SUPPLIER_DEBT &&
          line.counterpartyId
        ) {
          const amt = Number(line.amount);
          await tx.counterparty.update({
            where: { id: line.counterpartyId },
            data: {
              supplierDebt: { increment: amt },
              debtBalance: { decrement: amt },
            },
          });
          await tx.counterpartyBalance.upsert({
            where: { counterpartyId_currency: { counterpartyId: line.counterpartyId, currency: line.currency } },
            create: { tenantId, counterpartyId: line.counterpartyId, currency: line.currency, supplierDebt: amt },
            update: { supplierDebt: { increment: amt } },
          });
        }
      }

      // 5. Process Fixed Assets lines
      for (const line of doc.lines) {
        if (line.category === OpeningBalanceCategory.FIXED_ASSET) {
          if (line.fixedAssetId) {
            await tx.fixedAsset.update({
              where: { id: line.fixedAssetId },
              data: { status: 'ACTIVE' },
            });
          }
        }
      }

      // 6. Generate double-entry NAS JournalEntry with Account "00"
      let auxiliaryAccount = await tx.account.findFirst({
        where: { tenantId, code: '00' },
      });
      if (!auxiliaryAccount) {
        auxiliaryAccount = await tx.account.create({
          data: {
            tenantId,
            code: '00',
            name: {
              uz: 'Boshlang‘ich qoldiqlar yordamchi hisobvarag‘i',
              ru: 'Вспомогательный счет ввода остатков 00',
            },
            type: AccountType.EQUITY,
            isSystem: true,
          },
        });
      }

      const journalEntry = await tx.journalEntry.create({
        data: {
          tenantId,
          entryNumber: `JE-OB-${doc.docNumber}`,
          entryDate: doc.openingDate,
          description: `Boshlang‘ich qoldiqlar o‘tkazmasi (${doc.docNumber})`,
          sourceDocType: 'OpeningBalanceDocument',
          sourceDocId: doc.id,
        },
      });

      // Find or link standard asset and liability accounts
      const acc5010 = await tx.account.findFirst({ where: { tenantId, code: '5010' } });
      const acc5110 = await tx.account.findFirst({ where: { tenantId, code: '5110' } });
      const acc2910 = await tx.account.findFirst({ where: { tenantId, code: '2910' } });
      const acc4010 = await tx.account.findFirst({ where: { tenantId, code: '4010' } });
      const acc6010 = await tx.account.findFirst({ where: { tenantId, code: '6010' } });
      const acc8330 = await tx.account.findFirst({ where: { tenantId, code: '8330' } });

      let lineIdx = 0;
      // Asset journal lines (Debit Asset / Credit 00)
      if (acc5010 && metrics.categoryBreakdown[OpeningBalanceCategory.CASH] > 0) {
        await tx.journalLine.create({
          data: {
            entryId: journalEntry.id,
            debitAccountId: acc5010.id,
            creditAccountId: auxiliaryAccount.id,
            amount: metrics.categoryBreakdown[OpeningBalanceCategory.CASH],
            description: 'Kassa boshlang‘ich qoldig‘i',
          },
        });
      }
      if (acc5110 && metrics.categoryBreakdown[OpeningBalanceCategory.BANK] > 0) {
        await tx.journalLine.create({
          data: {
            entryId: journalEntry.id,
            debitAccountId: acc5110.id,
            creditAccountId: auxiliaryAccount.id,
            amount: metrics.categoryBreakdown[OpeningBalanceCategory.BANK],
            description: 'Bank hisobraqam boshlang‘ich qoldig‘i',
          },
        });
      }
      if (acc2910 && metrics.categoryBreakdown[OpeningBalanceCategory.INVENTORY] > 0) {
        await tx.journalLine.create({
          data: {
            entryId: journalEntry.id,
            debitAccountId: acc2910.id,
            creditAccountId: auxiliaryAccount.id,
            amount: metrics.categoryBreakdown[OpeningBalanceCategory.INVENTORY],
            description: 'Tovar-moddiy zaxiralar boshlang‘ich qoldig‘i',
          },
        });
      }
      if (acc4010 && metrics.categoryBreakdown[OpeningBalanceCategory.CUSTOMER_DEBT] > 0) {
        await tx.journalLine.create({
          data: {
            entryId: journalEntry.id,
            debitAccountId: acc4010.id,
            creditAccountId: auxiliaryAccount.id,
            amount: metrics.categoryBreakdown[OpeningBalanceCategory.CUSTOMER_DEBT],
            description: 'Xaridorlar qarzdorligi (debitorlik)',
          },
        });
      }

      // Liability & Equity journal lines (Debit 00 / Credit Liability/Equity)
      if (acc6010 && metrics.categoryBreakdown[OpeningBalanceCategory.SUPPLIER_DEBT] > 0) {
        await tx.journalLine.create({
          data: {
            entryId: journalEntry.id,
            debitAccountId: auxiliaryAccount.id,
            creditAccountId: acc6010.id,
            amount: metrics.categoryBreakdown[OpeningBalanceCategory.SUPPLIER_DEBT],
            description: 'Yetkazib beruvchilarga qarzdorlik (kreditorlik)',
          },
        });
      }
      if (acc8330 && metrics.totalEquity > 0) {
        await tx.journalLine.create({
          data: {
            entryId: journalEntry.id,
            debitAccountId: auxiliaryAccount.id,
            creditAccountId: acc8330.id,
            amount: metrics.totalEquity,
            description: 'Boshlang‘ich ustav kapitali / taqsimlanmagan foyda',
          },
        });
      }

      // 7. Transition document status to POSTED
      return tx.openingBalanceDocument.update({
        where: { id: documentId },
        data: {
          status: OpeningBalanceStatus.POSTED,
          approvedById: userId,
          approvedAt: new Date(),
          totalAssets: metrics.totalAssets,
          totalLiabilities: metrics.totalLiabilities,
          totalEquity: metrics.totalEquity,
          balanceDifference: 0,
        },
        include: { lines: true },
      });
    });
  }

  // ─── Document Reopening / Unposting (The Rollback Invariant) ─────

  async unpost(
    tenantId: string,
    userId: string,
    documentId: string,
    dto?: UnpostOpeningBalanceDto,
  ) {
    const doc = await this.prisma.openingBalanceDocument.findFirst({
      where: { id: documentId, tenantId },
      include: { lines: true },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');

    if (doc.status !== OpeningBalanceStatus.POSTED) {
      throw new BadRequestException('Faqat tasdiqlangan hujjatni qayta ochish mumkin');
    }

    // ─── Enforce Rollback Invariant ───

    // 1. Check Inventory Depletion
    for (const line of doc.lines) {
      if (line.category === OpeningBalanceCategory.INVENTORY && line.productId && line.warehouseId) {
        const batchNumber = line.batchNumber || `INIT-${doc.docNumber}`;
        const batches = await this.prisma.productBatch.findMany({
          where: {
            tenantId,
            warehouseId: line.warehouseId,
            productId: line.productId,
            batchNumber: { startsWith: batchNumber.substring(0, 15) },
          },
        });

        for (const batch of batches) {
          const initial = Number(batch.initialQty);
          const remaining = Number(batch.remainingQty);
          if (remaining < initial) {
            throw new BadRequestException(
              `Hujjatni qayta ochib bo‘lmaydi! Boshlang‘ich partiyadagi tovarlar allaqachon sotilgan yoki boshqa omborga ko‘chirilgan. (Partiya: ${batch.batchNumber}, Boshlang‘ich: ${initial}, Qoldiq: ${remaining})`,
            );
          }
        }
      }
    }

    // 2. Check Cash Depletion
    for (const line of doc.lines) {
      if (
        (line.category === OpeningBalanceCategory.CASH ||
          line.category === OpeningBalanceCategory.BANK) &&
        line.accountId
      ) {
        const account = await this.prisma.cashAccount.findUnique({
          where: { id: line.accountId },
        });
        const currentBalance = Number(account?.balance || 0);
        const lineAmount = Number(line.amount);
        if (currentBalance < lineAmount) {
          throw new BadRequestException(
            `Hujjatni qayta ochib bo‘lmaydi! Kassadagi mablag‘ boshlang‘ich kiritilgan summadan kamayib ketgan. Kassa: ${account?.currency}, Hozirgi qoldiq: ${currentBalance}, Boshlang‘ich summa: ${lineAmount}`,
          );
        }
      }
    }

    // Execute safe atomic rollback
    return this.prisma.$transaction(async (tx) => {
      // 1. Revert Cash & Bank
      for (const line of doc.lines) {
        if (
          (line.category === OpeningBalanceCategory.CASH ||
            line.category === OpeningBalanceCategory.BANK) &&
          line.accountId
        ) {
          await tx.cashAccount.update({
            where: { id: line.accountId },
            data: { balance: { decrement: Number(line.amount) } },
          });
        }
      }

      // Delete linked FinanceTransactions
      await tx.financeTransaction.deleteMany({
        where: {
          tenantId,
          sourceDocType: 'OpeningBalanceDocument',
          sourceDocId: doc.id,
        },
      });

      // 2. Revert Inventory & delete batches
      for (const line of doc.lines) {
        if (
          line.category === OpeningBalanceCategory.INVENTORY &&
          line.productId &&
          line.warehouseId
        ) {
          const qty = Number(line.quantity || 0);
          await tx.stockLevel.update({
            where: {
              tenantId_warehouseId_productId: {
                tenantId,
                warehouseId: line.warehouseId,
                productId: line.productId,
              },
            },
            data: { quantity: { decrement: qty } },
          });

          // Delete created batches
          const batchPrefix = line.batchNumber || `INIT-${doc.docNumber}`;
          await tx.productBatch.deleteMany({
            where: {
              tenantId,
              warehouseId: line.warehouseId,
              productId: line.productId,
              batchNumber: { startsWith: batchPrefix.substring(0, 15) },
              receiptId: null,
            },
          });
        }
      }

      // 3. Revert Customer Debts
      for (const line of doc.lines) {
        if (
          line.category === OpeningBalanceCategory.CUSTOMER_DEBT &&
          line.counterpartyId
        ) {
          const amt = Number(line.amount);
          await tx.counterparty.update({
            where: { id: line.counterpartyId },
            data: {
              customerDebt: { decrement: amt },
              debtBalance: { decrement: amt },
            },
          });
        }
      }

      // 4. Revert Supplier Debts
      for (const line of doc.lines) {
        if (
          line.category === OpeningBalanceCategory.SUPPLIER_DEBT &&
          line.counterpartyId
        ) {
          const amt = Number(line.amount);
          await tx.counterparty.update({
            where: { id: line.counterpartyId },
            data: {
              supplierDebt: { decrement: amt },
              debtBalance: { increment: amt },
            },
          });
        }
      }

      // 5. Delete Journal Entries
      const je = await tx.journalEntry.findFirst({
        where: {
          tenantId,
          sourceDocType: 'OpeningBalanceDocument',
          sourceDocId: doc.id,
        },
      });
      if (je) {
        await tx.journalLine.deleteMany({ where: { entryId: je.id } });
        await tx.journalEntry.delete({ where: { id: je.id } });
      }

      // 6. Reset document status to DRAFT
      return tx.openingBalanceDocument.update({
        where: { id: documentId },
        data: {
          status: OpeningBalanceStatus.DRAFT,
          approvedById: null,
          approvedAt: null,
          notes: dto?.reason ? `${doc.notes || ''}\n[Qayta ochildi]: ${dto.reason}`.trim() : doc.notes,
        },
        include: { lines: true },
      });
    });
  }

  // ─── Delete Draft ────────────────────────────────────────────────

  async delete(tenantId: string, id: string) {
    const doc = await this.prisma.openingBalanceDocument.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');
    if (doc.status === OpeningBalanceStatus.POSTED) {
      throw new BadRequestException('Tasdiqlangan hujjatni o‘chirib bo‘lmaydi. Avval qayta oching');
    }

    return this.prisma.openingBalanceDocument.delete({ where: { id } });
  }

  // ─── Cutoff Date Gate Helper ─────────────────────────────────────

  async checkCutoffDate(tenantId: string, transactionDate: Date) {
    const postedDoc = await this.prisma.openingBalanceDocument.findFirst({
      where: { tenantId, status: OpeningBalanceStatus.POSTED },
      orderBy: { openingDate: 'asc' },
    });

    if (postedDoc && new Date(transactionDate) < new Date(postedDoc.openingDate)) {
      throw new BadRequestException(
        `Hujjat sanasi korxonaning boshlang‘ich qoldiq sanasidan (${postedDoc.openingDate.toISOString().slice(0, 10)}) oldin bo‘lishi mumkin emas`,
      );
    }
    return true;
  }
}
