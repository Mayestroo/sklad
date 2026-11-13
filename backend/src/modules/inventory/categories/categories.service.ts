import { Injectable, NotFoundException } from '@nestjs/common';
import { asJson } from '../../../common/utils/json-column';
import { PrismaService } from '../../../common/prisma';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto';
import { assertTenantOwned } from '../../../common/prisma/assert-tenant-owned';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCategoryDto) {
    await assertTenantOwned(this.prisma, tenantId, { category: dto.parentId });
    return this.prisma.category.create({
      data: {
        tenantId,
        name: asJson(dto.name),
        parentId: dto.parentId || null,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId },
      include: {
        children: true,
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
      include: { children: true, products: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    await assertTenantOwned(this.prisma, tenantId, { category: dto.parentId });

    return this.prisma.category.update({
      where: { tenantId, id },
      data: {
        name: dto.name ? asJson(dto.name) : undefined,
        parentId: dto.parentId !== undefined ? dto.parentId : undefined,
      },
      include: {
        children: true,
        _count: { select: { products: true } },
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { products: true, children: true } },
      },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Unassign products from this category before deleting
    await this.prisma.product.updateMany({
      where: { tenantId, categoryId: id },
      data: { categoryId: null },
    });

    // Unassign child categories
    await this.prisma.category.updateMany({
      where: { tenantId, parentId: id },
      data: { parentId: null },
    });

    await this.prisma.category.delete({
      where: { tenantId, id },
    });

    return { success: true, message: 'Kategoriya muvaffaqiyatli o‘chirildi' };
  }
}
