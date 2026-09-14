import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateFixedAssetDto, UpdateFixedAssetDto } from './dto/fixed-asset.dto';

@Injectable()
export class FixedAssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, search?: string) {
    const where: any = { tenantId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { inventoryNumber: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.fixedAsset.findMany({
      where,
      include: {
        custodian: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id, tenantId },
      include: {
        custodian: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
    if (!asset) throw new NotFoundException('Fixed asset not found');
    return asset;
  }

  async create(tenantId: string, dto: CreateFixedAssetDto) {
    const existing = await this.prisma.fixedAsset.findFirst({
      where: { tenantId, inventoryNumber: dto.inventoryNumber },
    });
    if (existing) {
      throw new ConflictException(
        `Fixed asset with inventory number ${dto.inventoryNumber} already exists`,
      );
    }

    const initialCost = Number(dto.initialCost || 0);
    const accumulatedDepreciation = Number(dto.accumulatedDepreciation || 0);
    const netBookValue = Math.max(0, initialCost - accumulatedDepreciation);

    return this.prisma.fixedAsset.create({
      data: {
        tenantId,
        name: dto.name,
        inventoryNumber: dto.inventoryNumber,
        assetType: dto.assetType || 'EQUIPMENT',
        acquisitionDate: dto.acquisitionDate
          ? new Date(dto.acquisitionDate)
          : new Date(),
        initialCost,
        accumulatedDepreciation,
        netBookValue,
        usefulLifeMonths: dto.usefulLifeMonths || 60,
        depreciationMethod: dto.depreciationMethod || 'STRAIGHT_LINE',
        custodianUserId: dto.custodianUserId || null,
        status: dto.status || 'ACTIVE',
        notes: dto.notes || null,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateFixedAssetDto) {
    await this.findOne(tenantId, id);

    const data: any = { ...dto };
    if (dto.acquisitionDate) {
      data.acquisitionDate = new Date(dto.acquisitionDate);
    }
    if (dto.initialCost !== undefined || dto.accumulatedDepreciation !== undefined) {
      const current = await this.prisma.fixedAsset.findUnique({ where: { id } });
      const initCost =
        dto.initialCost !== undefined
          ? Number(dto.initialCost)
          : Number(current?.initialCost || 0);
      const accDep =
        dto.accumulatedDepreciation !== undefined
          ? Number(dto.accumulatedDepreciation)
          : Number(current?.accumulatedDepreciation || 0);
      data.netBookValue = Math.max(0, initCost - accDep);
    }

    return this.prisma.fixedAsset.update({
      where: { id },
      data,
    });
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.fixedAsset.delete({ where: { id } });
  }
}
