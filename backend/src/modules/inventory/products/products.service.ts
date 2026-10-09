import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../common/prisma';
import { CreateProductDto, UpdateProductDto } from '../dto';
import { SUPPORTED_CURRENCIES } from '../../../common/validators/currency.validator';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateProductDto) {
    const sku = dto.sku?.trim() || this.generateSku(dto.type);
    const existingSku = await this.prisma.product.findFirst({
      where: { tenantId, sku },
    });

    if (existingSku) {
      throw new ConflictException(
        `Product with SKU '${sku}' already exists`,
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const salesDefaultCurrency = (company?.settings as any)?.sales?.defaultCurrency;
    const salePriceCurrency = dto.salePriceCurrency ?? (
      SUPPORTED_CURRENCIES.includes(salesDefaultCurrency as (typeof SUPPORTED_CURRENCIES)[number])
        ? salesDefaultCurrency
        : null
    );
    if (
      salePriceCurrency !== null &&
      !SUPPORTED_CURRENCIES.includes(salePriceCurrency as (typeof SUPPORTED_CURRENCIES)[number])
    ) {
      throw new BadRequestException('Product sale-price currency must be USD or UZS');
    }
    if (Number(dto.salePrice ?? 0) > 0 && !salePriceCurrency) {
      throw new BadRequestException('Set a supported sale-price currency before saving a nonzero product price');
    }

    const costPriceCurrency = dto.costPriceCurrency ?? 'UZS';
    const costPriceExchangeRateInput = Number(dto.costPriceExchangeRate);
    const costPriceExchangeRate = costPriceCurrency === 'UZS'
      ? 1
      : Number(dto.costPrice ?? 0) === 0 && (!Number.isFinite(costPriceExchangeRateInput) || costPriceExchangeRateInput <= 0)
        ? 1
        : costPriceExchangeRateInput;
    if (!SUPPORTED_CURRENCIES.includes(costPriceCurrency as (typeof SUPPORTED_CURRENCIES)[number])) {
      throw new BadRequestException('Product cost-price currency must be USD or UZS');
    }
    if (Number(dto.costPrice ?? 0) > 0 && (!Number.isFinite(costPriceExchangeRate) || costPriceExchangeRate <= 0)) {
      throw new BadRequestException('Enter a positive exchange rate for a foreign-currency cost price');
    }

    return this.prisma.product.create({
      data: {
        tenantId,
        name: dto.name as any,
        description: dto.description ? (dto.description as any) : undefined,
        categoryId: dto.categoryId || null,
        type: dto.type || 'PRODUCT',
        sku,
        barcode: dto.barcode || null,
        unitOfMeasure: dto.unitOfMeasure || 'piece',
        costPrice: dto.costPrice || 0,
        costPriceCurrency,
        costPriceExchangeRate,
        salePrice: dto.salePrice || 0,
        salePriceCurrency,
        vatRate: dto.vatRate !== undefined ? dto.vatRate : 12,
        minStockAlert: dto.minStockAlert || 0,
        isActive: true,
      },
      include: {
        category: true,
      },
    });
  }

  private generateSku(type?: CreateProductDto['type']): string {
    const prefix = type === 'RAW_MATERIAL' ? 'RAW' : type === 'SERVICE' ? 'SRV' : 'PRD';
    return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
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
        productPrices: {
          select: {
            id: true,
            priceListId: true,
            price: true,
          },
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
        productPrices: {
          select: {
            id: true,
            priceListId: true,
            price: true,
            updatedAt: true,
          },
        },
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

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const costPriceCurrency = dto.costPriceCurrency ?? product.costPriceCurrency ?? 'UZS';
    const nextCostPrice = dto.costPrice !== undefined ? Number(dto.costPrice) : Number(product.costPrice);
    const costPriceExchangeRateInput = dto.costPriceExchangeRate !== undefined
      ? Number(dto.costPriceExchangeRate)
      : Number(product.costPriceExchangeRate);
    const costPriceExchangeRate = costPriceCurrency === 'UZS'
      ? 1
      : nextCostPrice === 0 && (!Number.isFinite(costPriceExchangeRateInput) || costPriceExchangeRateInput <= 0)
        ? 1
        : costPriceExchangeRateInput;
    if (!SUPPORTED_CURRENCIES.includes(costPriceCurrency as (typeof SUPPORTED_CURRENCIES)[number])) {
      throw new BadRequestException('Product cost-price currency must be USD or UZS');
    }
    if (nextCostPrice > 0 && (!Number.isFinite(costPriceExchangeRate) || costPriceExchangeRate <= 0)) {
      throw new BadRequestException('Enter a positive exchange rate for a foreign-currency cost price');
    }

    const nextSalePrice = dto.salePrice !== undefined ? Number(dto.salePrice) : Number(product.salePrice);
    const salePriceCurrency = dto.salePriceCurrency ?? product.salePriceCurrency;
    if (
      salePriceCurrency != null &&
      !SUPPORTED_CURRENCIES.includes(salePriceCurrency as (typeof SUPPORTED_CURRENCIES)[number])
    ) {
      throw new BadRequestException('Product sale-price currency must be USD or UZS');
    }
    if (
      dto.salePrice !== undefined &&
      nextSalePrice !== Number(product.salePrice) &&
      nextSalePrice > 0 &&
      !salePriceCurrency
    ) {
      throw new BadRequestException('Choose a sale-price currency before changing an unresolved product price');
    }

    if (dto.sku && dto.sku !== product.sku) {
      const existingSku = await this.prisma.product.findFirst({
        where: { tenantId, sku: dto.sku, id: { not: id } },
      });
      if (existingSku) {
        throw new ConflictException(
          `Product with SKU '${dto.sku}' already exists`,
        );
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name ? (dto.name as any) : undefined,
        description:
          dto.description !== undefined
            ? (dto.description as any)
            : undefined,
        categoryId:
          dto.categoryId !== undefined ? dto.categoryId : undefined,
        type: dto.type ?? undefined,
        sku: dto.sku ?? undefined,
        barcode: dto.barcode !== undefined ? dto.barcode : undefined,
        unitOfMeasure: dto.unitOfMeasure ?? undefined,
        costPrice: dto.costPrice !== undefined ? dto.costPrice : undefined,
        costPriceCurrency,
        costPriceExchangeRate,
        salePrice: dto.salePrice !== undefined ? dto.salePrice : undefined,
        salePriceCurrency: salePriceCurrency ?? undefined,
        vatRate: dto.vatRate !== undefined ? dto.vatRate : undefined,
        minStockAlert:
          dto.minStockAlert !== undefined ? dto.minStockAlert : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
      include: {
        category: true,
        productPrices: {
          select: {
            id: true,
            priceListId: true,
            price: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check if product has transaction references
    const [receiptItems, invoiceItems, batches] = await Promise.all([
      this.prisma.purchaseReceiptItem.count({ where: { productId: id } }),
      this.prisma.salesInvoiceItem.count({ where: { productId: id } }),
      this.prisma.productBatch.count({ where: { productId: id } }),
    ]);

    const hasTransactions = receiptItems > 0 || invoiceItems > 0 || batches > 0;

    if (hasTransactions) {
      // Soft-delete (archive) to preserve accounting and batch invariants
      await this.prisma.product.update({
        where: { id },
        data: { isActive: false },
      });
      return {
        success: true,
        archived: true,
        message: 'Tovar muvaffaqiyatli arxivlandi',
      };
    }

    // Safe to hard-delete if no transactional history
    await this.prisma.stockLevel.deleteMany({ where: { productId: id } });
    await this.prisma.productPrice.deleteMany({ where: { productId: id } });
    await this.prisma.product.delete({ where: { id } });

    return {
      success: true,
      archived: false,
      message: 'Tovar muvaffaqiyatli o‘chirildi',
    };
  }
}
