import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { CreateDealDto } from '../dto';
import { DealStageSlug } from '@prisma/client';

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async createDeal(tenantId: string, dto: CreateDealDto) {
    return this.prisma.deal.create({
      data: {
        tenantId,
        counterpartyId: dto.counterpartyId,
        title: dto.title,
        stage: (dto.stage as DealStageSlug) || DealStageSlug.LEAD,
        amount: dto.amount || 0,
        assignedUserId: dto.assignedUserId || null,
      },
      include: {
        counterparty: true,
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findKanbanBoard(tenantId: string) {
    const deals = await this.prisma.deal.findMany({
      where: { tenantId },
      include: {
        counterparty: true,
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stages: DealStageSlug[] = [
      DealStageSlug.LEAD,
      DealStageSlug.QUALIFICATION,
      DealStageSlug.PROPOSAL,
      DealStageSlug.NEGOTIATION,
      DealStageSlug.WON,
      DealStageSlug.LOST,
    ];
    const kanban: Record<string, any[]> = {};

    stages.forEach((stage) => {
      kanban[stage] = deals.filter(
        (d: { stage: DealStageSlug }) => d.stage === stage,
      );
    });

    return kanban;
  }

  async updateDealStage(
    tenantId: string,
    dealId: string,
    stage: DealStageSlug,
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    return this.prisma.deal.update({
      where: { id: dealId },
      data: { stage },
      include: {
        counterparty: true,
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async updateDeal(
    tenantId: string,
    dealId: string,
    dto: {
      title?: string;
      amount?: number;
      counterpartyId?: string;
      stage?: DealStageSlug;
      assignedUserId?: string | null;
    },
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    return this.prisma.deal.update({
      where: { id: dealId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.amount !== undefined && { amount: Number(dto.amount) }),
        ...(dto.counterpartyId !== undefined && { counterpartyId: dto.counterpartyId }),
        ...(dto.stage !== undefined && { stage: dto.stage }),
        ...(dto.assignedUserId !== undefined && { assignedUserId: dto.assignedUserId }),
      },
      include: {
        counterparty: true,
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async deleteDeal(tenantId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    await this.prisma.deal.delete({
      where: { id: dealId },
    });

    return { success: true, message: 'Deal deleted successfully' };
  }
}

