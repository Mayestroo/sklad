import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        tenantId,
        name: dto.name as any,
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

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name ? (dto.name as any) : undefined,
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
      where: { categoryId: id },
      data: { categoryId: null },
    });

    // Unassign child categories
    await this.prisma.category.updateMany({
      where: { parentId: id },
      data: { parentId: null },
    });

    await this.prisma.category.delete({
      where: { id },
    });

    return { success: true, message: 'Kategoriya muvaffaqiyatli o‘chirildi' };
  }
}

