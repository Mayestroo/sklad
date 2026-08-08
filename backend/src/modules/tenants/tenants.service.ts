import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { CreateTenantDto } from './dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    const existing = await this.prisma.company.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException('Company with this slug already exists');
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    return this.prisma.company.create({
      data: {
        name: dto.name as any,
        slug: dto.slug,
        defaultLanguage: dto.defaultLanguage || 'uz',
        status: 'TRIAL',
        trialEndsAt,
      },
    });
  }

  async findAll() {
    return this.prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.company.findUnique({
      where: { id },
      include: {
        branches: { include: { warehouses: true } },
        warehouses: true,
      },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.company.findUnique({
      where: { slug },
    });
  }

  // ============================================
  // BRANCH MANAGEMENT
  // ============================================

  async createBranch(tenantId: string, name: { uz: string; ru: string }, address?: string, isMain?: boolean) {
    return this.prisma.branch.create({
      data: {
        tenantId,
        name,
        address,
        isMain: isMain || false,
      },
    });
  }

  async findAllBranches(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId },
      include: { warehouses: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ============================================
  // WAREHOUSE MANAGEMENT
  // ============================================

  async createWarehouse(
    tenantId: string,
    branchId: string | null,
    name: { uz: string; ru: string },
    address?: string,
    phone?: string,
  ) {
    return this.prisma.warehouse.create({
      data: {
        tenantId,
        branchId,
        name,
        address,
        phone,
      },
    });
  }

  async findAllWarehouses(tenantId: string) {
    return this.prisma.warehouse.findMany({
      where: { tenantId },
      include: { branch: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
