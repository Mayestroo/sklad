import { Injectable, NotFoundException } from '@nestjs/common';
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

  async findAll(
    tenantId: string,
    type?: string,
    folderId?: string,
    search?: string,
    hasDebt?: boolean,
  ) {
    const where: Prisma.CounterpartyWhereInput = { tenantId };

    if (type) {
      where.type = type as CounterpartyType;
    }

    if (folderId === 'unassigned') {
      where.folderId = null;
    } else if (folderId && folderId !== 'all') {
      where.folderId = folderId;
    }

    if (hasDebt) {
      where.debtBalance = { gt: 0 };
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { inn: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.counterparty.findMany({
      where,
      include: {
        folder: true,
        priceList: true,
        _count: {
          select: { salesInvoices: true, deals: true, payments: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id, tenantId },
      include: {
        folder: true,
        priceList: true,
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
}
