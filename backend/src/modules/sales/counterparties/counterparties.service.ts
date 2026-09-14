import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, CounterpartyType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma';
import {
  CreateCounterpartyDto,
  UpdateCounterpartyDto,
  CreateCounterpartyFolderDto,
  UpdateCounterpartyFolderDto,
} from '../dto';

@Injectable()
export class CounterpartiesService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // FOLDER METHODS
  // ============================================

  async createFolder(tenantId: string, dto: CreateCounterpartyFolderDto) {
    return this.prisma.counterpartyFolder.create({
      data: {
        tenantId,
        name: dto.name,
        color: dto.color || '#3b82f6',
      },
    });
  }

  async findAllFolders(tenantId: string) {
    const folders = await this.prisma.counterpartyFolder.findMany({
      where: { tenantId },
      include: {
        _count: { select: { counterparties: true } },
      },
      orderBy: { name: 'asc' },
    });

    const unassignedCount = await this.prisma.counterparty.count({
      where: { tenantId, folderId: null },
    });

    const totalCount = await this.prisma.counterparty.count({
      where: { tenantId },
    });

    return {
      folders,
      unassignedCount,
      totalCount,
    };
  }

  async updateFolder(
    tenantId: string,
    id: string,
    dto: UpdateCounterpartyFolderDto,
  ) {
    const folder = await this.prisma.counterpartyFolder.findFirst({
      where: { id, tenantId },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    return this.prisma.counterpartyFolder.update({
      where: { id },
      data: {
        name: dto.name ?? folder.name,
        color: dto.color ?? folder.color,
      },
    });
  }

  async deleteFolder(tenantId: string, id: string) {
    const folder = await this.prisma.counterpartyFolder.findFirst({
      where: { id, tenantId },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    return this.prisma.counterpartyFolder.delete({
      where: { id },
    });
  }

  // ============================================
  // COUNTERPARTY METHODS
  // ============================================

  async create(tenantId: string, dto: CreateCounterpartyDto) {
    return this.prisma.counterparty.create({
      data: {
        tenantId,
        type: dto.type,
        name: dto.name,
        inn: dto.inn || null,
        mfo: dto.mfo || null,
        bankAccount: dto.bankAccount || null,
        bankName: dto.bankName || null,
        phone: dto.phone || null,
        email: dto.email || null,
        address: dto.address || null,
        folderId: dto.folderId || null,
        priceListId: dto.priceListId || null,
        discountPercent: dto.discountPercent ? Number(dto.discountPercent) : 0,
        debtBalance: 0,
      },
      include: {
        folder: true,
        priceList: true,
      },
    });
  }

  async getSummary(tenantId: string) {
    const [customersCount, suppliersCount, counterpartiesWithBalance] =
      await Promise.all([
        this.prisma.counterparty.count({
          where: {
            tenantId,
            type: { in: [CounterpartyType.CUSTOMER, CounterpartyType.BOTH] },
          },
        }),
        this.prisma.counterparty.count({
          where: {
            tenantId,
            type: { in: [CounterpartyType.SUPPLIER, CounterpartyType.BOTH] },
          },
        }),
        this.prisma.counterparty.findMany({
          where: {
            tenantId,
            OR: [
              { customerDebt: { not: 0 } },
              { supplierDebt: { not: 0 } },
              { debtBalance: { not: 0 } },
            ],
          },
          select: {
            id: true,
            type: true,
            customerDebt: true,
            supplierDebt: true,
            debtBalance: true,
          },
        }),
      ]);

    let receivablesCount = 0;
    let receivablesAmount = 0;
    let payablesCount = 0;
    let payablesAmount = 0;

    for (const cp of counterpartiesWithBalance) {
      const custDebt = Number((cp as any).customerDebt || 0);
      const suppDebt = Number((cp as any).supplierDebt || 0);

      if (custDebt !== 0 || suppDebt !== 0) {
        if (custDebt > 0) {
          receivablesCount++;
          receivablesAmount += custDebt;
        } else if (custDebt < 0) {
          // Customer advance / prepayment received: liability (we owe goods/services)
          payablesCount++;
          payablesAmount += Math.abs(custDebt);
        }

        if (suppDebt > 0) {
          payablesCount++;
          payablesAmount += suppDebt;
        } else if (suppDebt < 0) {
          // Supplier overpayment / prepayment held with vendor: asset
          receivablesCount++;
          receivablesAmount += Math.abs(suppDebt);
        }
      } else {
        const rawBalance = Number(cp.debtBalance || 0);
        const netReceivable = cp.type === CounterpartyType.SUPPLIER ? -rawBalance : rawBalance;
        if (netReceivable > 0) {
          receivablesCount++;
          receivablesAmount += netReceivable;
        } else if (netReceivable < 0) {
          payablesCount++;
          payablesAmount += Math.abs(netReceivable);
        }
      }
    }

    const [recentReceipt, recentInvoice, company] = await Promise.all([
      this.prisma.purchaseReceipt?.findFirst
        ? this.prisma.purchaseReceipt.findFirst({
            where: { tenantId, status: 'POSTED' },
            select: { currency: true },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve(null),
      this.prisma.salesInvoice?.findFirst
        ? this.prisma.salesInvoice.findFirst({
            where: { tenantId, status: 'POSTED' },
            select: { currency: true },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve(null),
      this.prisma.company?.findUnique
        ? this.prisma.company.findUnique({
            where: { id: tenantId },
            select: { settings: true },
          })
        : Promise.resolve(null),
    ]);

    const reportCurrency =
      recentReceipt?.currency ||
      recentInvoice?.currency ||
      (company?.settings as any)?.sales?.defaultCurrency ||
      'USD';

    return {
      currency: reportCurrency,
      total_customers: customersCount,
      total_suppliers: suppliersCount,
      receivables: {
        count: receivablesCount,
        total_amount: Math.round(receivablesAmount * 100) / 100,
      },
      payables: {
        count: payablesCount,
        total_amount: Math.round(payablesAmount * 100) / 100,
      },
    };
  }

  async findAll(
    tenantId: string,
    type?: string,
    folderId?: string,
    search?: string,
    hasDebt?: boolean,
    balanceFilter?: 'all' | 'receivables' | 'payables' | 'settled',
  ) {
    const where: any = { tenantId };

    if (type) {
      where.type = type as CounterpartyType;
    }

    if (folderId === 'unassigned') {
      where.folderId = null;
    } else if (folderId && folderId !== 'all') {
      where.folderId = folderId;
    }

    if (balanceFilter === 'receivables') {
      where.OR = [
        { customerDebt: { gt: 0 } },
        { supplierDebt: { lt: 0 } },
        {
          AND: [
            { customerDebt: 0 },
            { supplierDebt: 0 },
            {
              OR: [
                { type: { in: [CounterpartyType.CUSTOMER, CounterpartyType.BOTH] }, debtBalance: { gt: 0 } },
                { type: CounterpartyType.SUPPLIER, debtBalance: { lt: 0 } },
              ],
            },
          ],
        },
      ];
    } else if (balanceFilter === 'payables') {
      where.OR = [
        { supplierDebt: { gt: 0 } },
        { customerDebt: { lt: 0 } },
        {
          AND: [
            { customerDebt: 0 },
            { supplierDebt: 0 },
            {
              OR: [
                { type: CounterpartyType.SUPPLIER, debtBalance: { gt: 0 } },
                { type: { in: [CounterpartyType.CUSTOMER, CounterpartyType.BOTH] }, debtBalance: { lt: 0 } },
              ],
            },
          ],
        },
      ];
    } else if (balanceFilter === 'settled') {
      where.AND = [
        { customerDebt: 0 },
        { supplierDebt: 0 },
        { debtBalance: 0 },
      ];
    } else if (hasDebt) {
      where.OR = [
        { customerDebt: { gt: 0 } },
        { supplierDebt: { gt: 0 } },
        { debtBalance: { not: 0 } },
      ];
    }

    if (search && search.trim()) {
      const q = search.trim();
      const searchOr = [
        { name: { contains: q, mode: 'insensitive' as const } },
        { inn: { contains: q, mode: 'insensitive' as const } },
        { phone: { contains: q, mode: 'insensitive' as const } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchOr }];
        delete where.OR;
      } else if (where.AND) {
        where.AND = [...(Array.isArray(where.AND) ? where.AND : [where.AND]), { OR: searchOr }];
      } else {
        where.OR = searchOr;
      }
    }

    const counterparties = await this.prisma.counterparty.findMany({
      where,
      include: {
        folder: true,
        priceList: true,
        purchaseReceipts: {
          select: { currency: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        salesInvoices: {
          select: { currency: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: { salesInvoices: true, deals: true, payments: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return counterparties.map((cp) => {
      const custDebt = Number((cp as any).customerDebt || 0);
      const suppDebt = Number((cp as any).supplierDebt || 0);
      const raw = Number(cp.debtBalance || 0);
      const net = (custDebt !== 0 || suppDebt !== 0)
        ? custDebt - suppDebt
        : cp.type === CounterpartyType.SUPPLIER ? -raw : raw;
      const currency =
        (cp as any).purchaseReceipts?.[0]?.currency ||
        (cp as any).salesInvoices?.[0]?.currency ||
        'UZS';
      return {
        ...cp,
        currency,
        customerDebt: custDebt,
        supplierDebt: suppDebt,
        netBalance: net,
      };
    });
  }


  async findById(tenantId: string, id: string) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id, tenantId },
      include: {
        folder: true,
        priceList: true,
        salesInvoices: { orderBy: { createdAt: 'desc' }, take: 10 },
        purchaseReceipts: { orderBy: { createdAt: 'desc' }, take: 10 },
        payments: { orderBy: { createdAt: 'desc' }, take: 10 },
        deals: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!counterparty) {
      throw new NotFoundException('Counterparty not found');
    }

    const custDebt = Number((counterparty as any).customerDebt || 0);
    const suppDebt = Number((counterparty as any).supplierDebt || 0);
    const raw = Number(counterparty.debtBalance || 0);
    const net = (custDebt !== 0 || suppDebt !== 0)
      ? custDebt - suppDebt
      : counterparty.type === CounterpartyType.SUPPLIER ? -raw : raw;
    const currency =
      (counterparty as any).purchaseReceipts?.[0]?.currency ||
      (counterparty as any).salesInvoices?.[0]?.currency ||
      'UZS';

    return {
      ...counterparty,
      currency,
      customerDebt: custDebt,
      supplierDebt: suppDebt,
      netBalance: net,
    };
  }

  async update(tenantId: string, id: string, dto: UpdateCounterpartyDto) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id, tenantId },
    });
    if (!counterparty) {
      throw new NotFoundException('Counterparty not found');
    }

    return this.prisma.counterparty.update({
      where: { id },
      data: {
        type: dto.type ?? counterparty.type,
        name: dto.name ?? counterparty.name,
        inn: dto.inn !== undefined ? dto.inn : counterparty.inn,
        mfo: dto.mfo !== undefined ? dto.mfo : counterparty.mfo,
        bankAccount:
          dto.bankAccount !== undefined
            ? dto.bankAccount
            : counterparty.bankAccount,
        bankName:
          dto.bankName !== undefined ? dto.bankName : counterparty.bankName,
        phone: dto.phone !== undefined ? dto.phone : counterparty.phone,
        email: dto.email !== undefined ? dto.email : counterparty.email,
        address: dto.address !== undefined ? dto.address : counterparty.address,
        folderId:
          dto.folderId !== undefined ? dto.folderId : counterparty.folderId,
        priceListId:
          dto.priceListId !== undefined ? dto.priceListId : counterparty.priceListId,
        discountPercent:
          dto.discountPercent !== undefined
            ? Number(dto.discountPercent)
            : counterparty.discountPercent,
      },
      include: {
        folder: true,
        priceList: true,
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id, tenantId },
    });

    if (!counterparty) {
      throw new NotFoundException('Counterparty not found');
    }

    const custDebt = Math.abs(Number((counterparty as any).customerDebt || 0));
    const suppDebt = Math.abs(Number((counterparty as any).supplierDebt || 0));
    const debt = Math.abs(Number(counterparty.debtBalance || 0));
    if (debt > 0.001 || custDebt > 0.001 || suppDebt > 0.001) {
      throw new BadRequestException(
        "Qarz balansi mavjud bo'lgan kontragentni o'chirib bo'lmaydi",
      );
    }

    const [invoicesCount, receiptsCount, paymentsCount, dealsCount] =
      await Promise.all([
        this.prisma.salesInvoice.count({ where: { counterpartyId: id } }),
        this.prisma.purchaseReceipt.count({ where: { counterpartyId: id } }),
        this.prisma.payment.count({ where: { counterpartyId: id } }),
        this.prisma.deal.count({ where: { counterpartyId: id } }),
      ]);

    if (
      invoicesCount > 0 ||
      receiptsCount > 0 ||
      paymentsCount > 0 ||
      dealsCount > 0
    ) {
      throw new BadRequestException(
        "Ushbu kontragent bilan bog'liq hujjatlar yoki to'lovlar mavjud bo'lganligi sababli uni o'chirib bo'lmaydi",
      );
    }

    await this.prisma.counterparty.delete({
      where: { id },
    });

    return {
      success: true,
      message: "Kontragent muvaffaqiyatli o'chirildi",
    };
  }

  async getStatement(tenantId: string, id: string) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id, tenantId },
      include: {
        folder: true,
        priceList: true,
        salesInvoices: {
          where: { status: 'POSTED' },
          orderBy: { invoiceDate: 'desc' },
          take: 50,
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            totalAmount: true,
            paidAmount: true,
            currency: true,
            paymentStatus: true,
            status: true,
          },
        },
        purchaseReceipts: {
          where: { status: 'POSTED' },
          orderBy: { docDate: 'desc' },
          take: 50,
          select: {
            id: true,
            docNumber: true,
            docDate: true,
            totalAmount: true,
            paidAmount: true,
            currency: true,
            paymentStatus: true,
            status: true,
          },
        },
        financeTransactions: {
          where: { status: 'POSTED' },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            docNumber: true,
            direction: true,
            amount: true,
            currency: true,
            createdAt: true,
            comment: true,
            account: { select: { id: true, name: true, accountType: true } },
          },
        },
        salesReturns: {
          where: { status: 'POSTED' },
          orderBy: { returnDate: 'desc' },
          take: 50,
          select: {
            id: true,
            returnNumber: true,
            returnDate: true,
            totalAmount: true,
            currency: true,
          },
        },
        purchaseReturns: {
          where: { status: 'POSTED' },
          orderBy: { returnDate: 'desc' },
          take: 50,
          select: {
            id: true,
            returnNumber: true,
            returnDate: true,
            totalAmount: true,
            currency: true,
          },
        },
      },
    });

    if (!counterparty) {
      throw new NotFoundException('Counterparty not found');
    }

    const custDebt = Number((counterparty as any).customerDebt || 0);
    const suppDebt = Number((counterparty as any).supplierDebt || 0);
    const raw = Number(counterparty.debtBalance || 0);
    const net = (custDebt !== 0 || suppDebt !== 0)
      ? custDebt - suppDebt
      : counterparty.type === CounterpartyType.SUPPLIER ? -raw : raw;

    // Build unified chronological statement transactions
    type StatementTx = {
      id: string;
      date: string;
      docNumber: string;
      type: 'SALES_INVOICE' | 'PURCHASE_RECEIPT' | 'PAYMENT_INCOME' | 'PAYMENT_EXPENSE' | 'SALES_RETURN' | 'PURCHASE_RETURN';
      description: string;
      debit: number;
      credit: number;
      amount: number;
      currency: string;
    };

    const transactions: StatementTx[] = [];

    for (const inv of counterparty.salesInvoices) {
      transactions.push({
        id: inv.id,
        date: inv.invoiceDate.toISOString(),
        docNumber: inv.invoiceNumber,
        type: 'SALES_INVOICE',
        description: `Sotuv invoysi #${inv.invoiceNumber}`,
        debit: Number(inv.totalAmount),
        credit: 0,
        amount: Number(inv.totalAmount),
        currency: inv.currency,
      });
    }

    for (const rec of counterparty.purchaseReceipts) {
      transactions.push({
        id: rec.id,
        date: rec.docDate.toISOString(),
        docNumber: rec.docNumber,
        type: 'PURCHASE_RECEIPT',
        description: `Xarid hujjati #${rec.docNumber}`,
        debit: 0,
        credit: Number(rec.totalAmount),
        amount: Number(rec.totalAmount),
        currency: rec.currency,
      });
    }

    for (const tx of counterparty.financeTransactions) {
      const isIncome = tx.direction === 'INCOME';
      transactions.push({
        id: tx.id,
        date: tx.createdAt.toISOString(),
        docNumber: tx.docNumber || '—',
        type: isIncome ? 'PAYMENT_INCOME' : 'PAYMENT_EXPENSE',
        description: tx.comment || (isIncome ? `Mijozdan to'lov qabul qilindi` : `Yetkazib beruvchiga to'lov berildi`),
        debit: isIncome ? 0 : Number(tx.amount),
        credit: isIncome ? Number(tx.amount) : 0,
        amount: Number(tx.amount),
        currency: tx.currency,
      });
    }

    for (const sr of counterparty.salesReturns) {
      transactions.push({
        id: sr.id,
        date: sr.returnDate.toISOString(),
        docNumber: sr.returnNumber,
        type: 'SALES_RETURN',
        description: `Mijozdan qaytarish #${sr.returnNumber}`,
        debit: 0,
        credit: Number(sr.totalAmount),
        amount: Number(sr.totalAmount),
        currency: sr.currency,
      });
    }

    for (const pr of counterparty.purchaseReturns) {
      transactions.push({
        id: pr.id,
        date: pr.returnDate.toISOString(),
        docNumber: pr.returnNumber,
        type: 'PURCHASE_RETURN',
        description: `Yetkazib beruvchiga qaytarish #${pr.returnNumber}`,
        debit: Number(pr.totalAmount),
        credit: 0,
        amount: Number(pr.totalAmount),
        currency: pr.currency,
      });
    }

    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      counterparty: {
        id: counterparty.id,
        name: counterparty.name,
        type: counterparty.type,
        inn: counterparty.inn,
        phone: counterparty.phone,
        email: counterparty.email,
        address: counterparty.address,
        customerDebt: custDebt,
        supplierDebt: suppDebt,
        netBalance: net,
        folder: counterparty.folder,
        priceList: counterparty.priceList,
      },
      summary: {
        customerDebt: custDebt,
        supplierDebt: suppDebt,
        netBalance: net,
        totalSalesInvoiced: counterparty.salesInvoices.reduce((sum, i) => sum + Number(i.totalAmount), 0),
        totalPurchasesInvoiced: counterparty.purchaseReceipts.reduce((sum, r) => sum + Number(r.totalAmount), 0),
        totalTransactionsCount: transactions.length,
      },
      transactions,
    };
  }
}

