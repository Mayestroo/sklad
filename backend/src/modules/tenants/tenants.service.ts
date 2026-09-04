import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { CreateTenantDto, UpdateCompanySettingsDto } from './dto';

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

  async createBranch(
    tenantId: string,
    name: { uz: string; ru: string },
    address?: string,
    isMain?: boolean,
  ) {
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

  // ============================================
  // SETTINGS MANAGEMENT
  // ============================================

  async getSettings(tenantId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (company?.settings as any) || {};
    return {
      sales: {
        enableMultiTierPriceLists: false,
        allowSellerPriceOverride: false,
        defaultCurrency: 'UZS',
        ...(settings.sales || {}),
      },
      inventory: settings.inventory || {},
      accounting: settings.accounting || {},
    };
  }

  async updateSettings(
    tenantId: string,
    dto: UpdateCompanySettingsDto,
    userId?: string,
  ) {
    const current = await this.getSettings(tenantId);
    const mergedSettings = {
      ...current,
      ...dto,
      sales: {
        ...current.sales,
        ...(dto.sales || {}),
      },
      inventory: {
        ...current.inventory,
        ...(dto.inventory || {}),
      },
      accounting: {
        ...current.accounting,
        ...(dto.accounting || {}),
      },
    };

    const updated = await this.prisma.company.update({
      where: { id: tenantId },
      data: { settings: mergedSettings },
      select: { id: true, settings: true },
    });

    if (userId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'CompanySettings',
          entityId: tenantId,
          action: 'UPDATE',
          newValue: mergedSettings,
        },
      });
    }

    return updated.settings;
  }
}
