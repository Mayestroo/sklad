import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { CreateCounterpartyDto } from '../dto';

@Injectable()
export class CounterpartiesService {
  constructor(private readonly prisma: PrismaService) {}

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
        debtBalance: 0,
      },
    });
  }

  async findAll(tenantId: string, type?: string) {
    const where: any = { tenantId };
    if (type) {
      where.type = type;
    }

    return this.prisma.counterparty.findMany({
      where,
      include: {
        _count: { select: { salesInvoices: true, deals: true, payments: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id, tenantId },
      include: {
        salesInvoices: { orderBy: { createdAt: 'desc' }, take: 10 },
        payments: { orderBy: { createdAt: 'desc' }, take: 10 },
        deals: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!counterparty) {
      throw new NotFoundException('Counterparty not found');
    }

    return counterparty;
  }
}
