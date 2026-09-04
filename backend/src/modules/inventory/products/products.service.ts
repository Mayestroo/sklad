import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { CreateProductDto } from '../dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateProductDto) {
    const existingSku = await this.prisma.product.findFirst({
      where: { tenantId, sku: dto.sku },
    });

    if (existingSku) {
      throw new ConflictException(
        `Product with SKU '${dto.sku}' already exists`,
      );
    }

    return this.prisma.product.create({
      data: {
        tenantId,
        name: dto.name as any,
        description: dto.description ? (dto.description as any) : undefined,
        categoryId: dto.categoryId || null,
        type: dto.type || 'PRODUCT',
        sku: dto.sku,
        barcode: dto.barcode || null,
        unitOfMeasure: dto.unitOfMeasure || 'piece',
        costPrice: dto.costPrice || 0,
        salePrice: dto.salePrice || 0,
        vatRate: dto.vatRate !== undefined ? dto.vatRate : 12,
        minStockAlert: dto.minStockAlert || 0,
        isActive: true,
      },
      include: {
        category: true,
      },
    });
  }

  async findAll(
    tenantId: string,
    categoryId?: string,
    search?: string,
    type?: string,
  ) {
    const where: any = { tenantId, isActive: true };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (type && type !== 'ALL') {
      where.type = type as any;
    }

    let products = await this.prisma.product.findMany({
      where,
      include: {
        category: true,
        stockLevels: {
          include: { warehouse: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      products = products.filter((p) => {
        const skuMatch = p.sku?.toLowerCase().includes(q);
        const barcodeMatch = p.barcode?.toLowerCase().includes(q);
        const nameObj =
          typeof p.name === 'object' && p.name !== null
            ? (p.name as Record<string, string>)
            : {};
        const uzMatch = nameObj.uz?.toLowerCase().includes(q);
        const ruMatch = nameObj.ru?.toLowerCase().includes(q);
        return skuMatch || barcodeMatch || uzMatch || ruMatch;
      });
    }

    // Compute total stock per product across warehouses
    return products.map((p) => {
      const totalStock = p.stockLevels.reduce(
        (acc, sl) => acc + Number(sl.quantity),
        0,
      );
      return {
        ...p,
        totalStock,
        isLowStock:
          Number(p.minStockAlert) > 0 && totalStock <= Number(p.minStockAlert),
      };
    });
  }

  async findById(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        stockLevels: {
          include: { warehouse: true },
        },
        variants: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const totalStock = product.stockLevels.reduce(
      (acc, sl) => acc + Number(sl.quantity),
      0,
    );

    return {
      ...product,
      totalStock,
      isLowStock:
        Number(product.minStockAlert) > 0 &&
        totalStock <= Number(product.minStockAlert),
    };
  }

  async findByBarcode(tenantId: string, barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: { tenantId, barcode, isActive: true },
      include: {
        category: true,
        stockLevels: {
          include: { warehouse: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(
        `Product with barcode '${barcode}' not found`,
      );
    }

    return product;
  }

  async findLowStockAlerts(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        minStockAlert: { gt: 0 },
      },
      include: {
        category: true,
        stockLevels: {
          include: { warehouse: true },
        },
      },
    });

    return products
      .map((p) => {
        const totalStock = p.stockLevels.reduce(
          (acc, sl) => acc + Number(sl.quantity),
          0,
        );
        return {
          ...p,
          totalStock,
          isLowStock: totalStock <= Number(p.minStockAlert),
        };
      })
      .filter((p) => p.isLowStock);
  }

  async findStockLevels(tenantId: string, warehouseId?: string) {
    const where: any = { tenantId };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }
    return this.prisma.stockLevel.findMany({
      where,
      include: {
        product: true,
        warehouse: true,
      },
    });
  }
}
