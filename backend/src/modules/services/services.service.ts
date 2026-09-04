import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { JournalService } from '../accounting/journal/journal.service';
import {
  ServiceActStatus,
  ServicePaymentStatus,
  ServiceActType,
  Prisma,
} from '@prisma/client';
import {
  CreateServiceActDto,
  CreateServiceActItemDto,
} from './dto/create-service-act.dto';
import { UpdateServiceActDto } from './dto/update-service-act.dto';
import { FilterServiceActsDto } from './dto/filter-service-acts.dto';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
  ) {}

  /**
   * Helper: Calculate line item amounts
   */
  private calculateItem(item: CreateServiceActItemDto) {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice) || 0;
    const subtotal = qty * price;
    const vatRate = Number(item.vatRate) || 0;
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
    const year = new Date().getFullYear();
    const prefix = `ACT-${year}-`;
    const count = await this.prisma.serviceAct.count({
      where: {
        tenantId,
        actNumber: { startsWith: prefix },
      },
    });
    const nextSeq = (count + 1).toString().padStart(4, '0');
    return `${prefix}${nextSeq}`;
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
      throw new BadRequestException("Kamida bitta xizmat qatori kiritilishi shart");
    }

    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id: dto.counterpartyId, tenantId },
    });
    if (!counterparty) {
      throw new NotFoundException('Kontragent topilmadi');
    }

    const calculatedItems = dto.items.map((item) => this.calculateItem(item));
    const subtotal = calculatedItems.reduce((s, i) => s + i.subtotalNumber, 0);
    const vatAmount = calculatedItems.reduce((s, i) => s + i.vatAmountNumber, 0);
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
        actDate: dto.actDate ? new Date(dto.actDate) : new Date(),
        currency: dto.currency || 'UZS',
        exchangeRate: dto.exchangeRate ? new Prisma.Decimal(dto.exchangeRate) : new Prisma.Decimal(1.0),
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
            select: { id: true, name: true, inn: true, phone: true, type: true },
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
        "Faqat qoralama (DRAFT) holatidagi aktni tahrirlash mumkin",
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

    let subtotal = Number(act.subtotal);
    let vatAmount = Number(act.vatAmount);
    let totalAmount = Number(act.totalAmount);
    let calculatedItems: ReturnType<typeof this.calculateItem>[] | null = null;

    if (dto.items) {
      if (dto.items.length === 0) {
        throw new BadRequestException("Kamida bitta xizmat qatori kiritilishi shart");
      }
      calculatedItems = dto.items.map((item) => this.calculateItem(item));
      subtotal = calculatedItems.reduce((s, i) => s + i.subtotalNumber, 0);
      vatAmount = calculatedItems.reduce((s, i) => s + i.vatAmountNumber, 0);
      totalAmount = calculatedItems.reduce((s, i) => s + i.totalNumber, 0);
    }

    return this.prisma.$transaction(async (tx) => {
      if (calculatedItems) {
        await tx.serviceActItem.deleteMany({ where: { actId: id } });
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
        where: { id },
        data: {
          type: dto.type ?? act.type,
          counterpartyId: dto.counterpartyId ?? act.counterpartyId,
          actDate: dto.actDate ? new Date(dto.actDate) : act.actDate,
          currency: dto.currency ?? act.currency,
          exchangeRate: dto.exchangeRate ? new Prisma.Decimal(dto.exchangeRate) : act.exchangeRate,
          externalNumber: dto.externalNumber !== undefined ? dto.externalNumber : act.externalNumber,
          externalDate: dto.externalDate ? new Date(dto.externalDate) : act.externalDate,
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
      throw new BadRequestException("Faqat qoralama (DRAFT) holatidagi akt tasdiqlanishi mumkin");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceAct.update({
        where: { id },
        data: { status: ServiceActStatus.POSTED },
        include: { counterparty: true, items: true },
      });

      // Update counterparty debt balance
      // Both PROVIDED (customer owes us) and RECEIVED (we owe supplier) increment debtBalance in positive scale
      if (Number(act.totalAmount) > 0) {
        await tx.counterparty.update({
          where: { id: act.counterpartyId },
          data: { debtBalance: { increment: act.totalAmount } },
        });
      }

      // Create automated BHMS double-entry journal postings
      await this.journalService.autoPostServiceAct(tenantId, updated);

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
      // If was POSTED, reverse counterparty debt and remove journal entry
      if (act.status === ServiceActStatus.POSTED && Number(act.totalAmount) > 0) {
        await tx.counterparty.update({
          where: { id: act.counterpartyId },
          data: { debtBalance: { decrement: act.totalAmount } },
        });

        await tx.journalEntry.deleteMany({
          where: {
            tenantId,
            sourceDocType: 'ServiceAct',
            sourceDocId: id,
          },
        });
      }

      return tx.serviceAct.update({
        where: { id },
        data: { status: ServiceActStatus.CANCELLED },
        include: { counterparty: true, items: true },
      });
    });
  }

  /**
   * Delete service act (DRAFT only)
   */
  async remove(tenantId: string, id: string) {
    const act = await this.prisma.serviceAct.findFirst({
      where: { id, tenantId },
    });

    if (!act) {
      throw new NotFoundException('Xizmatlar dalolatnomasi topilmadi');
    }

    if (act.status !== ServiceActStatus.DRAFT) {
      throw new BadRequestException(
        "Faqat qoralama (DRAFT) holatidagi aktni o'chirish mumkin. Tasdiqlangan aktni bekor qiling.",
      );
    }

    return this.prisma.serviceAct.delete({
      where: { id },
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
