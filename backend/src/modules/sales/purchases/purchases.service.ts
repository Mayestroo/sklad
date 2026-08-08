import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { tenantId },
      include: {
        counterparty: true,
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
