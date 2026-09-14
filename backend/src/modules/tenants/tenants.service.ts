import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        branches: { include: { warehouses: true } },
        warehouses: true,
      },
    });
    return company;
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
    if (isMain) {
      await this.prisma.branch.updateMany({
        where: { tenantId },
        data: { isMain: false },
      });
    }

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

  async updateBranch(
    tenantId: string,
    branchId: string,
    data: {
      name?: { uz: string; ru: string };
      address?: string;
      isMain?: boolean;
    },
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
    });
    if (!branch) throw new NotFoundException('Filial topilmadi');

    if (data.isMain) {
      await this.prisma.branch.updateMany({
        where: { tenantId, id: { not: branchId } },
        data: { isMain: false },
      });
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.isMain !== undefined && { isMain: data.isMain }),
      },
      include: { warehouses: true },
    });
  }

  async deleteBranch(tenantId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
      include: { warehouses: true },
    });
    if (!branch) throw new NotFoundException('Filial topilmadi');

    if (branch.warehouses && branch.warehouses.length > 0) {
      throw new BadRequestException(
        "Filialda omborxonalar mavjud. Avval omborxonalarni boshqa filialga ko'chiring yoki o'chiring",
      );
    }

    const totalBranches = await this.prisma.branch.count({
      where: { tenantId },
    });
    if (totalBranches <= 1) {
      throw new BadRequestException('Kompaniyada kamida bitta filial qolishi kerak');
    }

    await this.prisma.branch.delete({ where: { id: branchId } });
    return { success: true, message: 'Filial o‘chirildi' };
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

  async updateWarehouse(
    tenantId: string,
    warehouseId: string,
    data: {
      branchId?: string | null;
      name?: { uz: string; ru: string };
      address?: string;
      phone?: string;
    },
  ) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
    });
    if (!warehouse) throw new NotFoundException('Omborxona topilmadi');

    return this.prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        ...(data.branchId !== undefined && { branchId: data.branchId }),
        ...(data.name && { name: data.name }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.phone !== undefined && { phone: data.phone }),
      },
      include: { branch: true },
    });
  }

  async deleteWarehouse(tenantId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
    });
    if (!warehouse) throw new NotFoundException('Omborxona topilmadi');

    const totalWarehouses = await this.prisma.warehouse.count({
      where: { tenantId },
    });
    if (totalWarehouses <= 1) {
      throw new BadRequestException('Kompaniyada kamida bitta omborxona qolishi kerak');
    }

    // Check if warehouse has non-zero stock
    const activeStockCount = await this.prisma.stockLevel.count({
      where: { tenantId, warehouseId, quantity: { gt: 0 } },
    });
    if (activeStockCount > 0) {
      throw new BadRequestException(
        "Omborda tovar qoldiqlari mavjud. Omborni o'chirishdan oldin qoldiqlarni chiqim qiling yoki ko'chiring",
      );
    }

    // Check if historical documents reference this warehouse
    const docsCount = await this.prisma.inventoryDocument.count({
      where: { warehouseId, tenantId },
    });
    const invoicesCount = await this.prisma.salesInvoice.count({
      where: { warehouseId, tenantId },
    });
    const receiptsCount = await this.prisma.purchaseReceipt.count({
      where: { warehouseId, tenantId },
    });

    if (docsCount > 0 || invoicesCount > 0 || receiptsCount > 0) {
      throw new BadRequestException(
        "Ushbu ombor bilan bog'liq o'tgan operatsiyalar mavjud. Tarixiy hisobotlar buzilmasligi uchun uni o'chirib bo'lmaydi",
      );
    }

    await this.prisma.stockLevel.deleteMany({
      where: { tenantId, warehouseId },
    });

    await this.prisma.warehouse.delete({ where: { id: warehouseId } });
    return { success: true, message: 'Omborxona o‘chirildi' };
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
        defaultCurrency: 'USD',
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
