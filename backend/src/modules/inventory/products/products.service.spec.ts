import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../../common/prisma';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';

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
    company: { findUnique: jest.fn() },
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

  describe('sale price currency', () => {
    it('persists an explicit supported currency instead of using the company default', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);
      mockPrisma.company.findUnique.mockResolvedValue({ settings: { sales: { defaultCurrency: 'USD' } } });
      mockPrisma.product.create.mockResolvedValue({ id: 'p-1', salePriceCurrency: 'UZS' });

      await service.create('t-1', {
        name: { uz: 'Mahsulot', ru: 'Товар' },
        sku: 'SKU-1',
        salePrice: 125000,
        salePriceCurrency: 'UZS',
      });

      expect(mockPrisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ salePrice: 125000, salePriceCurrency: 'UZS' }),
      }));
    });

    it('uses the tenant sales default for a new product when currency is omitted', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);
      mockPrisma.company.findUnique.mockResolvedValue({ settings: { sales: { defaultCurrency: 'USD' } } });
      mockPrisma.product.create.mockResolvedValue({ id: 'p-1', salePriceCurrency: 'USD' });

      await service.create('t-1', {
        name: { uz: 'Mahsulot', ru: 'Товар' },
        sku: 'SKU-2',
        salePrice: 10,
      });

      expect(mockPrisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ salePriceCurrency: 'USD' }),
      }));
    });

    it('rejects a nonzero new sale price when no supported currency can be resolved', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);
      mockPrisma.company.findUnique.mockResolvedValue({ settings: { sales: { defaultCurrency: 'EUR' } } });

      await expect(service.create('t-1', {
        name: { uz: 'Mahsulot', ru: 'Товар' },
        sku: 'SKU-3',
        salePrice: 10,
      })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
    });

    it('preserves a saved currency when editing only the sale price', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'p-1', tenantId: 't-1', sku: 'SKU-1', salePrice: 100, salePriceCurrency: 'USD',
      });
      mockPrisma.product.update.mockResolvedValue({ id: 'p-1', salePriceCurrency: 'USD' });

      await service.update('t-1', 'p-1', { salePrice: 125 });

      expect(mockPrisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ salePrice: 125, salePriceCurrency: 'USD' }),
      }));
    });

    it('requires a currency before changing the price of an unresolved legacy product', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'p-legacy', tenantId: 't-1', sku: 'SKU-OLD', salePrice: 100, salePriceCurrency: null,
      });

      await expect(service.update('t-1', 'p-legacy', { salePrice: 125 })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('cost price currency', () => {
    it('stores the manually selected currency and its UZS exchange rate', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);
      mockPrisma.company.findUnique.mockResolvedValue({ settings: { sales: { defaultCurrency: 'UZS' } } });
      mockPrisma.product.create.mockResolvedValue({ id: 'p-cost' });

      await service.create('t-1', {
        name: { uz: 'Xomashyo', ru: 'Сырье' },
        sku: 'COST-1',
        costPrice: 10,
        costPriceCurrency: 'USD',
        costPriceExchangeRate: 12500,
      });

      expect(mockPrisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          costPrice: 10,
          costPriceCurrency: 'USD',
          costPriceExchangeRate: 12500,
        }),
      }));
    });

    it('requires a positive exchange rate for a nonzero USD cost price', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);
      mockPrisma.product.create.mockResolvedValue({ id: 'p-cost' });

      await expect(service.create('t-1', {
        name: { uz: 'Xomashyo', ru: 'Сырье' },
        sku: 'COST-USD',
        costPrice: 10,
        costPriceCurrency: 'USD',
      })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
    });

    it('generates a SKU when the optional SKU field is omitted', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);
      mockPrisma.product.create.mockResolvedValue({ id: 'p-auto' });

      await service.create('t-1', {
        name: { uz: 'Mahsulot', ru: 'Товар' },
      });

      expect(mockPrisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ sku: expect.stringMatching(/^PRD-[A-F0-9]{8}$/) }),
      }));
    });
  });

  describe('update', () => {
    it('should update product details successfully', async () => {
      const tenantId = 't-1';
      const id = 'p-1';
      mockPrisma.product.findFirst
        .mockResolvedValueOnce({ id, tenantId, sku: 'OLD-SKU', salePrice: 0, salePriceCurrency: 'UZS' })
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
        .mockResolvedValueOnce({ id, tenantId, sku: 'OLD-SKU', salePrice: 0, salePriceCurrency: 'UZS' }) // first call for product lookup
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

  describe('findById and findAll with productPrices', () => {
    it('should include productPrices when finding by id', async () => {
      const tenantId = 't-1';
      const id = 'p-1';
      mockPrisma.product.findFirst.mockResolvedValue({
        id,
        tenantId,
        stockLevels: [],
        productPrices: [
          { id: 'pp-1', priceListId: 'pl-1', price: 150000 },
        ],
      });

      const result = await service.findById(tenantId, id);
      expect(result.productPrices).toHaveLength(1);
      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id, tenantId },
          include: expect.objectContaining({
            productPrices: expect.any(Object),
          }),
        }),
      );
    });

    it('should include productPrices when finding all products', async () => {
      const tenantId = 't-1';
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'p-1',
          name: { uz: 'Lampa' },
          stockLevels: [],
          productPrices: [{ id: 'pp-1', priceListId: 'pl-1', price: 120000 }],
        },
      ]);

      const result = await service.findAll(tenantId);
      expect(result[0].productPrices).toHaveLength(1);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            productPrices: expect.any(Object),
          }),
        }),
      );
    });
  });
});
