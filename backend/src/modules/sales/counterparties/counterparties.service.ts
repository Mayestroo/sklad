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
    const created = await this.prisma.counterparty.create({
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
      },
      include: {
        folder: true,
        priceList: true,
        balances: {
          select: { currency: true, customerDebt: true, supplierDebt: true },
          orderBy: { currency: 'asc' },
        },
      },
    });
    const { balances, debtBalance: _debtBalance, customerDebt: _customerDebt, supplierDebt: _supplierDebt, ...counterparty } = created;
    return {
      ...counterparty,
      balancesByCurrency: balances.map((balance) => ({
        currency: balance.currency,
        customerDebt: Number(balance.customerDebt),
        supplierDebt: Number(balance.supplierDebt),
        netBalance: Number(balance.customerDebt) - Number(balance.supplierDebt),
      })),
    };
  }

  async getSummary(tenantId: string) {
    const [customersCount, suppliersCount, balances] =
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
        this.prisma.counterpartyBalance.findMany({
          where: { tenantId },
          select: {
            counterpartyId: true,
            currency: true,
            customerDebt: true,
            supplierDebt: true,
          },
        }),
      ]);

    const receivableCounterparties = new Set<string>();
    const payableCounterparties = new Set<string>();
    const receivablesByCurrency: Record<string, number> = {};
    const payablesByCurrency: Record<string, number> = {};
    const customerAdvancesByCurrency: Record<string, number> = {};
    const supplierAdvancesByCurrency: Record<string, number> = {};
    for (const balance of balances) {
      const customerDebt = Number(balance.customerDebt);
      const supplierDebt = Number(balance.supplierDebt);
      if (customerDebt > 0) {
        receivableCounterparties.add(balance.counterpartyId);
        receivablesByCurrency[balance.currency] = (receivablesByCurrency[balance.currency] ?? 0) + customerDebt;
      }
      if (supplierDebt > 0) {
        payableCounterparties.add(balance.counterpartyId);
        payablesByCurrency[balance.currency] = (payablesByCurrency[balance.currency] ?? 0) + supplierDebt;
      }
      if (customerDebt < 0) {
        customerAdvancesByCurrency[balance.currency] = (customerAdvancesByCurrency[balance.currency] ?? 0) + Math.abs(customerDebt);
      }
      if (supplierDebt < 0) {
        supplierAdvancesByCurrency[balance.currency] = (supplierAdvancesByCurrency[balance.currency] ?? 0) + Math.abs(supplierDebt);
      }
    }

    const amountInOnlyCurrency = (amounts: Record<string, number>) => {
      const entries = Object.values(amounts);
      return entries.length === 1 ? entries[0] : 0;
    };

    return {
      total_customers: customersCount,
      total_suppliers: suppliersCount,
      receivables: {
        count: receivableCounterparties.size,
        total_amount: amountInOnlyCurrency(receivablesByCurrency),
        byCurrency: Object.entries(receivablesByCurrency).map(([currency, amount]) => ({ currency, amount })),
      },
      payables: {
        count: payableCounterparties.size,
        total_amount: amountInOnlyCurrency(payablesByCurrency),
        byCurrency: Object.entries(payablesByCurrency).map(([currency, amount]) => ({ currency, amount })),
      },
      customerAdvancesByCurrency: Object.entries(customerAdvancesByCurrency).map(([currency, amount]) => ({ currency, amount })),
      supplierAdvancesByCurrency: Object.entries(supplierAdvancesByCurrency).map(([currency, amount]) => ({ currency, amount })),
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
      where.balances = {
        some: { OR: [{ customerDebt: { gt: 0 } }, { supplierDebt: { lt: 0 } }] },
      };
    } else if (balanceFilter === 'payables') {
      where.balances = {
        some: { OR: [{ supplierDebt: { gt: 0 } }, { customerDebt: { lt: 0 } }] },
      };
    } else if (balanceFilter === 'settled') {
      where.balances = { none: { OR: [{ customerDebt: { not: 0 } }, { supplierDebt: { not: 0 } }] } };
    } else if (hasDebt) {
      where.balances = {
        some: { OR: [{ customerDebt: { not: 0 } }, { supplierDebt: { not: 0 } }] },
      };
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
        balances: {
          select: { currency: true, customerDebt: true, supplierDebt: true },
          orderBy: { currency: 'asc' },
        },
        _count: {
          select: { salesInvoices: true, deals: true, payments: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return counterparties.map((cp) => {
      const { balances, debtBalance: _debtBalance, customerDebt: _customerDebt, supplierDebt: _supplierDebt, ...counterparty } = cp;
      const balancesByCurrency = balances.map((balance) => ({
        currency: balance.currency,
        customerDebt: Number(balance.customerDebt),
        supplierDebt: Number(balance.supplierDebt),
        netBalance: Number(balance.customerDebt) - Number(balance.supplierDebt),
      }));
      return {
        ...counterparty,
        balancesByCurrency,
      };
    });
  }


  async findById(tenantId: string, id: string) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id, tenantId },
      include: {
        folder: true,
        priceList: true,
        balances: {
          select: { currency: true, customerDebt: true, supplierDebt: true },
          orderBy: { currency: 'asc' },
        },
        salesInvoices: { orderBy: { createdAt: 'desc' }, take: 10 },
        purchaseReceipts: { orderBy: { createdAt: 'desc' }, take: 10 },
        payments: { orderBy: { createdAt: 'desc' }, take: 10 },
        deals: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!counterparty) {
      throw new NotFoundException('Counterparty not found');
    }

    const { balances, debtBalance: _debtBalance, customerDebt: _customerDebt, supplierDebt: _supplierDebt, ...counterpartyData } = counterparty;
    const balancesByCurrency = balances.map((balance) => ({
      currency: balance.currency,
      customerDebt: Number(balance.customerDebt),
      supplierDebt: Number(balance.supplierDebt),
      netBalance: Number(balance.customerDebt) - Number(balance.supplierDebt),
    }));

    return {
      ...counterpartyData,
      balancesByCurrency,
    };
  }

  async update(tenantId: string, id: string, dto: UpdateCounterpartyDto) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id, tenantId },
    });
    if (!counterparty) {
      throw new NotFoundException('Counterparty not found');
    }

    const updated = await this.prisma.counterparty.update({
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
        balances: {
          select: { currency: true, customerDebt: true, supplierDebt: true },
          orderBy: { currency: 'asc' },
        },
      },
    });
    const { balances, debtBalance: _debtBalance, customerDebt: _customerDebt, supplierDebt: _supplierDebt, ...counterpartyData } = updated;
    return {
      ...counterpartyData,
      balancesByCurrency: balances.map((balance) => ({
        currency: balance.currency,
        customerDebt: Number(balance.customerDebt),
        supplierDebt: Number(balance.supplierDebt),
        netBalance: Number(balance.customerDebt) - Number(balance.supplierDebt),
      })),
    };
  }

  async delete(tenantId: string, id: string) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id, tenantId },
    });

    if (!counterparty) {
      throw new NotFoundException('Counterparty not found');
    }

    const balances = await this.prisma.counterpartyBalance.findMany({
      where: { tenantId, counterpartyId: id },
      select: { customerDebt: true, supplierDebt: true },
    });
    const hasOutstandingBalance = balances.some(
      (balance) => Math.abs(Number(balance.customerDebt)) > 0.001 || Math.abs(Number(balance.supplierDebt)) > 0.001,
    );
    const hasLegacyScalarBalance =
      Math.abs(Number(counterparty.debtBalance)) > 0.001 ||
      Math.abs(Number(counterparty.customerDebt)) > 0.001 ||
      Math.abs(Number(counterparty.supplierDebt)) > 0.001;
    if (hasOutstandingBalance || hasLegacyScalarBalance) {
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
        balances: {
          select: { currency: true, customerDebt: true, supplierDebt: true },
          orderBy: { currency: 'asc' },
        },
      },
    });

    if (!counterparty) {
      throw new NotFoundException('Counterparty not found');
    }

    const entries = await this.prisma.counterpartySettlementEntry.findMany({
      where: { tenantId, counterpartyId: id },
      orderBy: { effectiveAt: 'desc' },
      take: 500,
    });
    const financeIds = [...new Set(
      entries.filter((entry) => entry.sourceDocType === 'FinanceTransaction').map((entry) => entry.sourceDocId),
    )];
    const financeTransactions = financeIds.length > 0
      ? await this.prisma.financeTransaction.findMany({
          where: { tenantId, id: { in: financeIds } },
          select: { id: true, direction: true, docNumber: true, comment: true },
        })
      : [];
    const financeById = new Map(financeTransactions.map((transaction) => [transaction.id, transaction]));
    const balancesByCurrency = counterparty.balances.map((balance) => ({
      currency: balance.currency,
      customerDebt: Number(balance.customerDebt),
      supplierDebt: Number(balance.supplierDebt),
      netBalance: Number(balance.customerDebt) - Number(balance.supplierDebt),
    }));
    const groupedTransactions = new Map<string, number>();
    for (const entry of entries) {
      if (entry.sourceDocType !== 'SalesInvoice' && entry.sourceDocType !== 'PurchaseReceipt') continue;
      const key = `${entry.sourceDocType}\u0000${entry.currency}`;
      groupedTransactions.set(key, (groupedTransactions.get(key) ?? 0) + Number(entry.amount));
    }
    const salesInvoicedByCurrency = Array.from(groupedTransactions)
      .filter(([key]) => key.startsWith('SalesInvoice\u0000'))
      .map(([key, amount]) => ({ currency: key.split('\u0000')[1], amount }));
    const purchasesInvoicedByCurrency = Array.from(groupedTransactions)
      .filter(([key]) => key.startsWith('PurchaseReceipt\u0000'))
      .map(([key, amount]) => ({ currency: key.split('\u0000')[1], amount }));
    const totalForOnlyCurrency = (items: Array<{ currency: string; amount: number }>) => items.length === 1 ? items[0].amount : 0;

    const transactions = entries.map((entry) => {
      const signedAmount = Number(entry.amount);
      const isCustomerSide = entry.side === 'CUSTOMER';
      const finance = entry.sourceDocType === 'FinanceTransaction' ? financeById.get(entry.sourceDocId) : undefined;
      const type = entry.sourceDocType === 'SalesInvoice'
        ? 'SALES_INVOICE'
        : entry.sourceDocType === 'PurchaseReceipt'
          ? 'PURCHASE_RECEIPT'
          : entry.sourceDocType === 'SalesReturn'
            ? 'SALES_RETURN'
            : entry.sourceDocType === 'PurchaseReturn'
              ? 'PURCHASE_RETURN'
              : entry.sourceDocType === 'FinanceTransaction'
                ? finance?.direction === 'INCOME' ? 'PAYMENT_INCOME' : 'PAYMENT_EXPENSE'
                : entry.sourceDocType === 'OpeningBalanceLine'
                  ? 'OPENING_BALANCE'
                  : entry.entryType;
      return {
        id: entry.id,
        date: entry.effectiveAt.toISOString(),
        docNumber: finance?.docNumber || `${entry.sourceDocType} ${entry.sourceDocId}`,
        type,
        entryType: entry.entryType,
        side: entry.side,
        description: finance?.comment || `${entry.entryType} (${entry.sourceDocType})`,
        debit: isCustomerSide ? Math.max(0, signedAmount) : Math.max(0, -signedAmount),
        credit: isCustomerSide ? Math.max(0, -signedAmount) : Math.max(0, signedAmount),
        amount: signedAmount,
        currency: entry.currency,
      };
    });

    return {
      counterparty: {
        id: counterparty.id,
        name: counterparty.name,
        type: counterparty.type,
        inn: counterparty.inn,
        phone: counterparty.phone,
        email: counterparty.email,
        address: counterparty.address,
        balancesByCurrency,
        folder: counterparty.folder,
        priceList: counterparty.priceList,
      },
      summary: {
        balancesByCurrency,
        salesInvoicedByCurrency,
        purchasesInvoicedByCurrency,
        totalSalesInvoiced: totalForOnlyCurrency(salesInvoicedByCurrency),
        totalPurchasesInvoiced: totalForOnlyCurrency(purchasesInvoicedByCurrency),
        totalTransactionsCount: transactions.length,
      },
      transactions,
    };
  }
}
