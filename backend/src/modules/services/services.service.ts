import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { nextDocumentNumber } from '../../common/sequences/document-sequence';
import { PrismaService } from '../../common/prisma';
import { JournalService } from '../accounting/journal/journal.service';
import {
  ServiceActStatus,
  ServicePaymentStatus,
  ServiceActType,
  OpeningBalanceStatus,
  CounterpartySettlementSide,
  Prisma,
} from '@prisma/client';
import {
  CreateServiceActDto,
  CreateServiceActItemDto,
} from './dto/create-service-act.dto';
import { UpdateServiceActDto } from './dto/update-service-act.dto';
import { FilterServiceActsDto } from './dto/filter-service-acts.dto';
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
} from '../../common/validators/currency.validator';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { assertTenantOwned } from '../../common/prisma/assert-tenant-owned';
import { assertPeriodOpen } from '../../common/accounting-period/period-lock';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
    private readonly settlementService: CounterpartySettlementService,
  ) {}

  /**
   * Helper: Ensure transaction date is not before the posted opening balance cutoff date
   */
  private async checkCutoffDate(tenantId: string, transactionDate: Date) {
    const postedDoc = await this.prisma.openingBalanceDocument.findFirst({
      where: { tenantId, status: OpeningBalanceStatus.POSTED },
      orderBy: { openingDate: 'asc' },
    });

    if (
      postedDoc &&
      new Date(transactionDate) < new Date(postedDoc.openingDate)
    ) {
      throw new BadRequestException(
        `Hujjat sanasi korxonaning boshlang‘ich qoldiq sanasidan (${postedDoc.openingDate.toISOString().slice(0, 10)}) oldin bo‘lishi mumkin emas`,
      );
    }
  }

  /**
   * Helper: Calculate line item amounts
   */
  private calculateItem(item: CreateServiceActItemDto) {
    const qty = Number(item.quantity);
    if (item.quantity == null || isNaN(qty) || qty <= 0) {
      throw new BadRequestException(
        "Xizmat qatorida miqdor (quantity) 0 dan katta bo'lishi shart",
      );
    }
    const price = Number(item.unitPrice);
    if (item.unitPrice == null || isNaN(price) || price < 0) {
      throw new BadRequestException(
        "Xizmat qatorida narx (unitPrice) 0 yoki undan katta bo'lishi shart",
      );
    }
    const subtotal = qty * price;
    const vatRate = item.vatRate != null ? Number(item.vatRate) : 0;
    if (isNaN(vatRate) || vatRate < 0) {
      throw new BadRequestException(
        "QQS stavkasi (vatRate) 0 yoki undan katta bo'lishi shart",
      );
    }
    const vatAmount = (subtotal * vatRate) / 100;
    const lineTotal = subtotal + vatAmount;

    return {
      productId: item.productId || null,
      serviceName: item.serviceName,
      description: item.description || null,
      unit: item.unit || 'piece',
      quantity: new Prisma.Decimal(qty),
      unitPrice: new Prisma.Decimal(price),
      vatRate: new Prisma.Decimal(vatRate),
      vatAmount: new Prisma.Decimal(vatAmount),
      lineTotal: new Prisma.Decimal(lineTotal),
      subtotalNumber: subtotal,
      vatAmountNumber: vatAmount,
      totalNumber: lineTotal,
    };
  }

  /**
   * Generate sequential act number: ACT-YYYY-XXXX
   */
  async generateActNumber(tenantId: string): Promise<string> {
    return nextDocumentNumber(this.prisma, tenantId, 'SERVICE_ACT');
  }

  /**
   * Create a new Service Act in DRAFT status
   */
  async create(
    tenantId: string,
    dto: CreateServiceActDto,
    createdById?: string,
  ) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException(
        'Kamida bitta xizmat qatori kiritilishi shart',
      );
    }

    if (!dto.currency || !isSupportedCurrency(dto.currency)) {
      throw new BadRequestException(
        `Valyuta ko'rsatilishi shart va faqat quyidagilardan biri bo'lishi mumkin: ${SUPPORTED_CURRENCIES.join(', ')}`,
      );
    }

    let exchangeRate = 1.0;
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

    const calculatedItems = dto.items.map((item) => this.calculateItem(item));
    await assertTenantOwned(this.prisma, tenantId, {
      product: dto.items.map((item) => item.productId),
    });

    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id: dto.counterpartyId, tenantId },
    });
    if (!counterparty) {
      throw new NotFoundException('Kontragent topilmadi');
    }

    const actDate = dto.actDate ? new Date(dto.actDate) : new Date();
    await this.checkCutoffDate(tenantId, actDate);

    const subtotal = calculatedItems.reduce((s, i) => s + i.subtotalNumber, 0);
    const vatAmount = calculatedItems.reduce(
      (s, i) => s + i.vatAmountNumber,
      0,
    );
    const totalAmount = calculatedItems.reduce((s, i) => s + i.totalNumber, 0);

    const actNumber = await this.generateActNumber(tenantId);

    return this.prisma.serviceAct.create({
      data: {
        tenantId,
        actNumber,
        type: dto.type,
        counterpartyId: dto.counterpartyId,
        status: ServiceActStatus.DRAFT,
        paymentStatus: ServicePaymentStatus.UNPAID,
        actDate,
        currency: dto.currency,
        exchangeRate: new Prisma.Decimal(exchangeRate),
        externalNumber: dto.externalNumber || null,
        externalDate: dto.externalDate ? new Date(dto.externalDate) : null,
        subtotal: new Prisma.Decimal(subtotal),
        vatAmount: new Prisma.Decimal(vatAmount),
        totalAmount: new Prisma.Decimal(totalAmount),
        paidAmount: new Prisma.Decimal(0),
        notes: dto.notes || null,
        createdById: createdById || null,
        items: {
          create: calculatedItems.map((item) => ({
            tenantId,
            productId: item.productId,
            serviceName: item.serviceName,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            vatAmount: item.vatAmount,
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: {
        counterparty: true,
        items: {
          include: { product: true },
        },
      },
    });
  }

  /**
   * List service acts with filters and pagination
   */
  async findAll(tenantId: string, filters: FilterServiceActsDto) {
    const page = filters.page ? Math.max(1, Number(filters.page)) : 1;
    const limit = filters.limit ? Math.max(1, Number(filters.limit)) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ServiceActWhereInput = { tenantId };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.paymentStatus) {
      where.paymentStatus = filters.paymentStatus;
    }

    if (filters.counterpartyId) {
      where.counterpartyId = filters.counterpartyId;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.actDate = {};
      if (filters.dateFrom) {
        where.actDate.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.actDate.lte = new Date(filters.dateTo + 'T23:59:59Z');
      }
    }

    if (filters.search) {
      where.OR = [
        { actNumber: { contains: filters.search, mode: 'insensitive' } },
        { externalNumber: { contains: filters.search, mode: 'insensitive' } },
        { notes: { contains: filters.search, mode: 'insensitive' } },
        {
          counterparty: {
            name: { contains: filters.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.serviceAct.findMany({
        where,
        skip,
        take: limit,
        orderBy: { actDate: 'desc' },
        include: {
          counterparty: {
            select: {
              id: true,
              name: true,
              inn: true,
              phone: true,
              type: true,
            },
          },
          items: true,
        },
      }),
      this.prisma.serviceAct.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get single service act with details and linked payments
   */
  async findOne(tenantId: string, id: string) {
    const act = await this.prisma.serviceAct.findFirst({
      where: { id, tenantId },
      include: {
        counterparty: true,
        items: {
          include: { product: true },
        },
      },
    });

    if (!act) {
      throw new NotFoundException('Xizmatlar dalolatnomasi topilmadi');
    }

    // Fetch linked finance payments
    const payments = await this.prisma.financeTransaction.findMany({
      where: {
        tenantId,
        sourceDocType: 'ServiceAct',
        sourceDocId: id,
        isDeleted: false,
      },
      include: {
        account: true,
      },
      orderBy: { transactionDate: 'desc' },
    });

    return { ...act, payments };
  }

  /**
   * Update DRAFT service act
   */
  async update(tenantId: string, id: string, dto: UpdateServiceActDto) {
    const act = await this.prisma.serviceAct.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });

    if (!act) {
      throw new NotFoundException('Xizmatlar dalolatnomasi topilmadi');
    }

    if (act.status !== ServiceActStatus.DRAFT) {
      throw new BadRequestException(
        'Faqat qoralama (DRAFT) holatidagi aktni tahrirlash mumkin',
      );
    }

    if (dto.counterpartyId && dto.counterpartyId !== act.counterpartyId) {
      const counterparty = await this.prisma.counterparty.findFirst({
        where: { id: dto.counterpartyId, tenantId },
      });
      if (!counterparty) {
        throw new NotFoundException('Kontragent topilmadi');
      }
    }

    if (dto.actDate) {
      await this.checkCutoffDate(tenantId, new Date(dto.actDate));
    }

    let subtotal = Number(act.subtotal);
    let vatAmount = Number(act.vatAmount);
    let totalAmount = Number(act.totalAmount);
    let calculatedItems: ReturnType<typeof this.calculateItem>[] | null = null;

    if (dto.items) {
      if (dto.items.length === 0) {
        throw new BadRequestException(
          'Kamida bitta xizmat qatori kiritilishi shart',
        );
      }
      calculatedItems = dto.items.map((item) => this.calculateItem(item));
      await assertTenantOwned(this.prisma, tenantId, {
        product: dto.items.map((item) => item.productId),
      });
      subtotal = calculatedItems.reduce((s, i) => s + i.subtotalNumber, 0);
      vatAmount = calculatedItems.reduce((s, i) => s + i.vatAmountNumber, 0);
      totalAmount = calculatedItems.reduce((s, i) => s + i.totalNumber, 0);
    }

    return this.prisma.$transaction(async (tx) => {
      if (calculatedItems) {
        await tx.serviceActItem.deleteMany({ where: { tenantId, actId: id } });
        await tx.serviceActItem.createMany({
          data: calculatedItems.map((item) => ({
            tenantId,
            actId: id,
            productId: item.productId,
            serviceName: item.serviceName,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            vatAmount: item.vatAmount,
            lineTotal: item.lineTotal,
          })),
        });
      }

      return tx.serviceAct.update({
        where: { tenantId, id },
        data: {
          type: dto.type ?? act.type,
          counterpartyId: dto.counterpartyId ?? act.counterpartyId,
          actDate: dto.actDate ? new Date(dto.actDate) : act.actDate,
          currency: dto.currency ?? act.currency,
          exchangeRate: dto.exchangeRate
            ? new Prisma.Decimal(dto.exchangeRate)
            : act.exchangeRate,
          externalNumber:
            dto.externalNumber !== undefined
              ? dto.externalNumber
              : act.externalNumber,
          externalDate: dto.externalDate
            ? new Date(dto.externalDate)
            : act.externalDate,
          subtotal: new Prisma.Decimal(subtotal),
          vatAmount: new Prisma.Decimal(vatAmount),
          totalAmount: new Prisma.Decimal(totalAmount),
          notes: dto.notes !== undefined ? dto.notes : act.notes,
        },
        include: {
          counterparty: true,
          items: {
            include: { product: true },
          },
        },
      });
    });
  }

  /**
   * Post service act (DRAFT -> POSTED)
   * Accrues counterparty debt and creates BHMS journal entries
   */
  async post(tenantId: string, id: string) {
    const act = await this.prisma.serviceAct.findFirst({
      where: { id, tenantId },
      include: { counterparty: true, items: true },
    });

    if (!act) {
      throw new NotFoundException('Xizmatlar dalolatnomasi topilmadi');
    }

    if (act.status !== ServiceActStatus.DRAFT) {
      throw new BadRequestException(
        'Faqat qoralama (DRAFT) holatidagi akt tasdiqlanishi mumkin',
      );
    }

    await this.checkCutoffDate(tenantId, act.actDate);

    return this.prisma.$transaction(async (tx) => {
      // D4: nothing dated in a closed accounting period may change.
      await assertPeriodOpen(tx, tenantId, act.actDate, 'post');
      const updated = await tx.serviceAct.update({
        where: { tenantId, id },
        data: { status: ServiceActStatus.POSTED },
        include: { counterparty: true, items: true },
      });

      // Accrue the service obligation in the document's native currency.
      if (Number(act.totalAmount) > 0) {
        await this.settlementService.recordMovement(tx, {
          tenantId,
          counterpartyId: act.counterpartyId,
          currency: act.currency,
          side:
            act.type === ServiceActType.PROVIDED
              ? CounterpartySettlementSide.CUSTOMER
              : CounterpartySettlementSide.SUPPLIER,
          amount: Number(act.totalAmount),
          entryType: 'SERVICE_ACT_POSTED',
          effectiveAt: act.actDate,
          sourceDocType: 'ServiceAct',
          sourceDocId: act.id,
          idempotencyKey: `ServiceAct:${act.id}:POSTED:${act.updatedAt.toISOString()}`,
        });
      }

      // Create automated BHMS double-entry journal postings
      await this.journalService.autoPostServiceAct(tenantId, updated, tx);

      return updated;
    });
  }

  /**
   * Cancel service act (POSTED -> CANCELLED)
   * Service Rollback Invariant: Blocks cancellation if payments are attached
   */
  async cancel(tenantId: string, id: string) {
    const act = await this.prisma.serviceAct.findFirst({
      where: { id, tenantId },
    });

    if (!act) {
      throw new NotFoundException('Xizmatlar dalolatnomasi topilmadi');
    }

    if (act.status === ServiceActStatus.CANCELLED) {
      throw new BadRequestException('Bu akt allaqachon bekor qilingan');
    }

    // Check Rollback Invariant: Cannot cancel if any payments were received/made
    if (Number(act.paidAmount) > 0) {
      throw new BadRequestException(
        "To'lov bog'langan xizmat aktini bekor qilib bo'lmaydi. Avval Moliya modulidagi to'lovni bekor qiling.",
      );
    }

    const linkedTxs = await this.prisma.financeTransaction.count({
      where: {
        tenantId,
        sourceDocType: 'ServiceAct',
        sourceDocId: id,
        isDeleted: false,
      },
    });

    if (linkedTxs > 0) {
      throw new BadRequestException(
        "Moliya operatsiyasi mavjud bo'lgan xizmat aktini bekor qilib bo'lmaydi.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // D4: nothing dated in a closed accounting period may change.
      if (act.status === ServiceActStatus.POSTED) {
        await assertPeriodOpen(tx, tenantId, act.actDate, 'cancel');
      }
      // If was POSTED, reverse counterparty debt and remove journal entry
      if (
        act.status === ServiceActStatus.POSTED &&
        Number(act.totalAmount) > 0
      ) {
        await this.settlementService.recordMovement(tx, {
          tenantId,
          counterpartyId: act.counterpartyId,
          currency: act.currency,
          side:
            act.type === ServiceActType.PROVIDED
              ? CounterpartySettlementSide.CUSTOMER
              : CounterpartySettlementSide.SUPPLIER,
          amount: -Number(act.totalAmount),
          entryType: 'SERVICE_ACT_CANCELLED',
          effectiveAt: act.actDate,
          sourceDocType: 'ServiceAct',
          sourceDocId: act.id,
          idempotencyKey: `ServiceAct:${act.id}:CANCELLED`,
        });

        await this.journalService.deleteEntriesForSource(
          tx,
          tenantId,
          'ServiceAct',
          id,
          'cancel',
        );
      }

      return tx.serviceAct.update({
        where: { tenantId, id },
        data: { status: ServiceActStatus.CANCELLED },
        include: { counterparty: true, items: true },
      });
    });
  }

  /**
   * Unpost service act (POSTED -> DRAFT)
   * Reverses counterparty debt and deletes linked journal entries
   * Service Rollback Invariant: Blocks unpost if payments are attached
   */
  async unpost(tenantId: string, id: string) {
    const act = await this.prisma.serviceAct.findFirst({
      where: { id, tenantId },
    });

    if (!act) {
      throw new NotFoundException('Xizmatlar dalolatnomasi topilmadi');
    }

    if (act.status !== ServiceActStatus.POSTED) {
      throw new BadRequestException(
        'Faqat tasdiqlangan (POSTED) akt o‘tkazmasini bekor qilish mumkin',
      );
    }

    // Check Rollback Invariant: Cannot unpost if any payments were received/made
    if (Number(act.paidAmount) > 0) {
      throw new BadRequestException(
        "To'lov bog'langan xizmat aktini bekor qilib bo'lmaydi. Avval Moliya modulidagi to'lovni bekor qiling.",
      );
    }

    const linkedTxs = await this.prisma.financeTransaction.count({
      where: {
        tenantId,
        sourceDocType: 'ServiceAct',
        sourceDocId: id,
        isDeleted: false,
      },
    });

    if (linkedTxs > 0) {
      throw new BadRequestException(
        "Moliya operatsiyasi mavjud bo'lgan xizmat aktini bekor qilib bo'lmaydi.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // D4: nothing dated in a closed accounting period may change.
      await assertPeriodOpen(tx, tenantId, act.actDate, 'unpost');
      // Reverse counterparty debt
      if (Number(act.totalAmount) > 0) {
        await this.settlementService.recordMovement(tx, {
          tenantId,
          counterpartyId: act.counterpartyId,
          currency: act.currency,
          side:
            act.type === ServiceActType.PROVIDED
              ? CounterpartySettlementSide.CUSTOMER
              : CounterpartySettlementSide.SUPPLIER,
          amount: -Number(act.totalAmount),
          entryType: 'SERVICE_ACT_UNPOSTED',
          effectiveAt: act.actDate,
          sourceDocType: 'ServiceAct',
          sourceDocId: act.id,
          idempotencyKey: `ServiceAct:${act.id}:UNPOSTED:${act.updatedAt.toISOString()}`,
        });
      }

      // Delete linked BHMS journal entry
      await this.journalService.deleteEntriesForSource(
        tx,
        tenantId,
        'ServiceAct',
        id,
        'unpost',
      );

      return tx.serviceAct.update({
        where: { tenantId, id },
        data: { status: ServiceActStatus.DRAFT },
        include: { counterparty: true, items: true },
      });
    });
  }

  /**
   * Delete service act (DRAFT or CANCELLED)
   */
  async remove(tenantId: string, id: string) {
    const act = await this.prisma.serviceAct.findFirst({
      where: { id, tenantId },
    });

    if (!act) {
      throw new NotFoundException('Xizmatlar dalolatnomasi topilmadi');
    }

    if (
      act.status !== ServiceActStatus.DRAFT &&
      act.status !== ServiceActStatus.CANCELLED
    ) {
      throw new BadRequestException(
        "Faqat qoralama (DRAFT) yoki bekor qilingan (CANCELLED) holatidagi aktni o'chirish mumkin. Avval bekor qiling yoki qoralamaga qaytaring.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.serviceActItem.deleteMany({
        where: { tenantId, actId: id },
      });

      return tx.serviceAct.delete({
        where: { tenantId, id },
      });
    });
  }

  /**
   * Get unpaid or partially paid acts for counterparty (used by Finance dropdowns)
   */
  async getUnpaidActs(
    tenantId: string,
    counterpartyId: string,
    type?: ServiceActType,
  ) {
    const where: Prisma.ServiceActWhereInput = {
      tenantId,
      counterpartyId,
      status: ServiceActStatus.POSTED,
      paymentStatus: {
        in: [ServicePaymentStatus.UNPAID, ServicePaymentStatus.PARTIALLY_PAID],
      },
    };

    if (type) {
      where.type = type;
    }

    return this.prisma.serviceAct.findMany({
      where,
      orderBy: { actDate: 'asc' },
      select: {
        id: true,
        actNumber: true,
        actDate: true,
        type: true,
        totalAmount: true,
        paidAmount: true,
        paymentStatus: true,
        currency: true,
      },
    });
  }
}
