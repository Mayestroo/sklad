import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../../common/prisma';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;

  const mockPrisma = {
    product: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    stockLevel: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    productPrice: {
      deleteMany: jest.fn(),
    },
    purchaseReceiptItem: {
      count: jest.fn(),
    },
    salesInvoiceItem: {
      count: jest.fn(),
    },
    productBatch: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('update', () => {
    it('should update product details successfully', async () => {
      const tenantId = 't-1';
      const id = 'p-1';
      mockPrisma.product.findFirst
        .mockResolvedValueOnce({ id, tenantId, sku: 'OLD-SKU' })
        .mockResolvedValueOnce(null);
      mockPrisma.product.update.mockResolvedValue({ id, tenantId, sku: 'NEW-SKU' });

      const result = await service.update(tenantId, id, { sku: 'NEW-SKU', salePrice: 50000 });
      expect(result.sku).toBe('NEW-SKU');
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id },
        }),
      );
    });

    it('should throw ConflictException if new SKU already exists on another product', async () => {
      const tenantId = 't-1';
      const id = 'p-1';
      mockPrisma.product.findFirst
        .mockResolvedValueOnce({ id, tenantId, sku: 'OLD-SKU' }) // first call for product lookup
        .mockResolvedValueOnce({ id: 'p-2', tenantId, sku: 'EXISTING-SKU' }); // second call for sku collision check

      await expect(
        service.update(tenantId, id, { sku: 'EXISTING-SKU' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('should hard delete product if no transactions exist', async () => {
      const tenantId = 't-1';
      const id = 'p-1';
      mockPrisma.product.findFirst.mockResolvedValue({ id, tenantId });
      mockPrisma.purchaseReceiptItem.count.mockResolvedValue(0);
      mockPrisma.salesInvoiceItem.count.mockResolvedValue(0);
      mockPrisma.productBatch.count.mockResolvedValue(0);
      mockPrisma.stockLevel.deleteMany.mockResolvedValue({});
      mockPrisma.productPrice.deleteMany.mockResolvedValue({});
      mockPrisma.product.delete.mockResolvedValue({ id });

      const result = await service.delete(tenantId, id);
      expect(result.archived).toBe(false);
      expect(mockPrisma.product.delete).toHaveBeenCalledWith({ where: { id } });
    });

    it('should soft delete (archive) product if transactions exist', async () => {
      const tenantId = 't-1';
      const id = 'p-1';
      mockPrisma.product.findFirst.mockResolvedValue({ id, tenantId });
      mockPrisma.purchaseReceiptItem.count.mockResolvedValue(3);
      mockPrisma.salesInvoiceItem.count.mockResolvedValue(0);
      mockPrisma.productBatch.count.mockResolvedValue(1);
      mockPrisma.product.update.mockResolvedValue({ id, isActive: false });

      const result = await service.delete(tenantId, id);
      expect(result.archived).toBe(true);
      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id },
        data: { isActive: false },
      });
      expect(mockPrisma.product.delete).not.toHaveBeenCalled();
    });
  });
});
