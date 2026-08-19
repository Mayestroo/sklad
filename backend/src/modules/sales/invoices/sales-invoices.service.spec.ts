import { Test, TestingModule } from '@nestjs/testing';
import { SalesInvoicesService } from './sales-invoices.service';
import { PrismaService } from '../../../common/prisma';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  SalesDocStatus,
  SalesPaymentStatus,
  SalesReturnStatus,
  SalesReturnDocStatus,
} from '@prisma/client';

describe('SalesInvoicesService Unit & Invariant Test Suite', () => {
  let service: SalesInvoicesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      salesInvoice: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
      salesInvoiceItem: {
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      salesReturn: {
        count: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      productBatch: {
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      batchConsumption: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      stockLevel: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      counterparty: {
        findFirst: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
      },
      account: {
        findFirst: jest.fn(),
      },
      journalEntry: {
        count: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      financeTransaction: {
        findMany: jest.fn(),
      },
      priceList: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      productPrice: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesInvoicesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SalesInvoicesService>(SalesInvoicesService);
  });

  describe('1. Draft Creation & Discount Calculation', () => {
    it('should create a draft invoice with accurate subtotal, discount, vat, and total amounts', async () => {
      prisma.salesInvoice.count.mockResolvedValue(0);
      prisma.salesInvoice.create.mockImplementation(({ data }) => ({
        id: 'inv-1',
        ...data,
      }));

      const dto = {
        counterpartyId: 'cust-1',
        warehouseId: 'wh-1',
        items: [
          {
            productId: 'prod-1',
            quantity: 10,
            unitPrice: 500000,
            discount: 50000, // 50,000 UZS line discount
            vatRate: 12, // 12% VAT
          },
        ],
      };

      const res = await service.createInvoice('tenant-1', 'user-1', dto);

      expect(res.id).toBe('inv-1');
      expect(prisma.salesInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceNumber: expect.stringMatching(/^INV-\d{4}-\d{4}$/),
            status: SalesDocStatus.DRAFT,
            subtotalAmount: 5000000,
            discountAmount: 50000,
            vatAmount: (4950000 * 12) / 100, // 594,000 UZS
            totalAmount: 4950000 + 594000, // 5,544,000 UZS
          }),
        }),
      );
    });

    it('should throw BadRequestException if items array is empty', async () => {
      await expect(
        service.createInvoice('tenant-1', 'user-1', {
          counterpartyId: 'cust-1',
          warehouseId: 'wh-1',
          items: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Post Invoice, Stock Validation & FIFO Landed Cost (COGS)', () => {
    it('should reject posting if available stock in warehouse is insufficient (Stock Invariant)', async () => {
      prisma.salesInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        tenantId: 'tenant-1',
        warehouseId: 'wh-1',
        status: SalesDocStatus.DRAFT,
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 10,
            product: { name: { uz: 'LED Lamp' } },
          },
        ],
      });

      // Only 5 in stock
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-1',
        quantity: 5,
      });

      await expect(
        service.postInvoice('tenant-1', 'user-1', 'inv-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should consume batches via FIFO, calculate accurate COGS and economic gross profit, and post journal entries', async () => {
      const mockInvoice = {
        id: 'inv-1',
        tenantId: 'tenant-1',
        invoiceNumber: 'INV-2026-0001',
        invoiceDate: new Date(),
        warehouseId: 'wh-1',
        counterpartyId: 'cust-1',
        status: SalesDocStatus.DRAFT,
        vatAmount: 0,
        totalAmount: 5000000, // 10 units @ 500,000 UZS
        counterparty: { id: 'cust-1', name: 'ABC Trade' },
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 10,
            unitPrice: 500000,
            totalPrice: 5000000,
            vatAmount: 0,
            product: { name: { uz: 'LED Lamp' } },
          },
        ],
      };

      prisma.salesInvoice.findFirst.mockResolvedValue(mockInvoice);
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-1',
        quantity: 20,
      });

      // 2 batches in FIFO order:
      // Batch 1: 6 units @ landedCost 300,000 UZS
      // Batch 2: 8 units @ landedCost 400,000 UZS
      prisma.productBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          remainingQty: 6,
          landedCost: 300000,
          purchasePrice: 280000,
        },
        {
          id: 'batch-2',
          remainingQty: 8,
          landedCost: 400000,
          purchasePrice: 380000,
        },
      ]);

      prisma.account.findFirst.mockImplementation(({ where }: any) => ({
        id: `acc-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.count.mockResolvedValue(0);

      prisma.salesInvoice.update.mockImplementation(({ data }) => ({
        ...mockInvoice,
        ...data,
      }));

      const res = await service.postInvoice('tenant-1', 'user-1', 'inv-1');

      // Expected COGS: (6 * 300,000) + (4 * 400,000) = 1,800,000 + 1,600,000 = 3,400,000 UZS
      // Gross Profit: 5,000,000 - 3,400,000 = 1,600,000 UZS
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { remainingQty: { decrement: 6 } },
      });
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-2' },
        data: { remainingQty: { decrement: 4 } },
      });

      expect(prisma.batchConsumption.create).toHaveBeenCalledTimes(2);
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: expect.anything(),
        data: { quantity: { decrement: 10 } },
      });

      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { debtBalance: { increment: 5000000 } },
      });

      expect(prisma.journalEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceDocType: 'SalesInvoice',
            sourceDocId: 'inv-1',
            lines: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  debitAccountId: 'acc-4010',
                  creditAccountId: 'acc-9010',
                  amount: 5000000,
                }),
                expect.objectContaining({
                  debitAccountId: 'acc-9110',
                  creditAccountId: 'acc-2910',
                  amount: 3400000,
                }),
              ]),
            },
          }),
        }),
      );

      expect(res.status).toBe(SalesDocStatus.POSTED);
      expect(res.totalCogs).toBe(3400000);
      expect(res.grossProfit).toBe(1600000);
    });
  });

  describe('3. Sales Rollback Invariant & Unposting', () => {
    it('should reject unposting if invoice has paidAmount > 0 (Rollback Invariant)', async () => {
      prisma.salesInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        tenantId: 'tenant-1',
        status: SalesDocStatus.POSTED,
        paidAmount: 2000000,
        paymentStatus: SalesPaymentStatus.PARTIALLY_PAID,
        returnStatus: SalesReturnStatus.NONE,
      });

      await expect(
        service.unpostInvoice('tenant-1', 'user-1', 'inv-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject unposting if invoice has returns registered against it', async () => {
      prisma.salesInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        tenantId: 'tenant-1',
        status: SalesDocStatus.POSTED,
        paidAmount: 0,
        paymentStatus: SalesPaymentStatus.UNPAID,
        returnStatus: SalesReturnStatus.PARTIALLY_RETURNED,
      });

      await expect(
        service.unpostInvoice('tenant-1', 'user-1', 'inv-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should safely unpost invoice by restoring stock, restoring batch quantities, and deleting journal entries', async () => {
      prisma.salesInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        tenantId: 'tenant-1',
        status: SalesDocStatus.POSTED,
        paidAmount: 0,
        paymentStatus: SalesPaymentStatus.UNPAID,
        returnStatus: SalesReturnStatus.NONE,
        counterpartyId: 'cust-1',
        totalAmount: 5000000,
        warehouseId: 'wh-1',
        items: [{ productId: 'prod-1', quantity: 10 }],
      });

      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-1',
        quantity: 10,
      });

      prisma.batchConsumption.findMany.mockResolvedValue([
        { batchId: 'batch-1', quantity: 6 },
        { batchId: 'batch-2', quantity: 4 },
      ]);

      prisma.salesInvoice.update.mockImplementation(({ data }) => ({
        id: 'inv-1',
        ...data,
      }));

      const res = await service.unpostInvoice('tenant-1', 'user-1', 'inv-1');

      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-1' },
        data: { quantity: { increment: 10 } },
      });
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { remainingQty: { increment: 6 } },
      });
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-2' },
        data: { remainingQty: { increment: 4 } },
      });
      expect(prisma.batchConsumption.deleteMany).toHaveBeenCalled();
      expect(prisma.journalEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          sourceDocType: 'SalesInvoice',
          sourceDocId: 'inv-1',
        },
      });
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { debtBalance: { decrement: 5000000 } },
      });
      expect(res.status).toBe(SalesDocStatus.DRAFT);
    });
  });

  describe('4. Sales Returns (Qaytarishlar) at Historical Landed Cost', () => {
    it('should restore stock, create new batch with historical unitCogs, reduce debt, and generate reversal journal entries', async () => {
      prisma.salesReturn.count.mockResolvedValue(0);
      prisma.salesInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        totalAmount: 5000000,
        items: [
          {
            productId: 'prod-1',
            quantity: 10,
            unitCogs: 340000, // Historical landed cost from sale
          },
        ],
        returns: [],
      });

      prisma.account.findFirst.mockImplementation(({ where }: any) => ({
        id: `acc-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.count.mockResolvedValue(0);

      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-1',
        quantity: 5,
      });

      prisma.salesReturn.create.mockImplementation(({ data }) => ({
        id: 'sret-1',
        ...data,
      }));

      const res = await service.createReturn('tenant-1', 'user-1', {
        invoiceId: 'inv-1',
        counterpartyId: 'cust-1',
        warehouseId: 'wh-1',
        items: [
          {
            productId: 'prod-1',
            quantity: 2,
            unitPrice: 500000,
          },
        ],
      });

      expect(res.totalAmount).toBe(1000000); // 2 * 500,000 UZS
      expect(res.totalCogs).toBe(680000); // 2 * 340,000 UZS historical COGS

      // Stock level increment
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: expect.anything(),
        data: { quantity: { increment: 2 } },
      });

      // ProductBatch created with historical landed cost
      expect(prisma.productBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productId: 'prod-1',
            warehouseId: 'wh-1',
            initialQty: 2,
            remainingQty: 2,
            purchasePrice: 340000,
            landedCost: 340000,
          }),
        }),
      );

      // Counterparty debt reduced
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { debtBalance: { decrement: 1000000 } },
      });

      // Parent invoice updated to PARTIALLY_RETURNED
      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { returnStatus: SalesReturnStatus.PARTIALLY_RETURNED },
      });
    });
  });
});
