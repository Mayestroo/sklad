import { Test, TestingModule } from '@nestjs/testing';
import { PurchasesService } from './purchases.service';
import { PrismaService } from '../../common/prisma';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  PurchaseDocStatus,
  PurchaseReturnStatus,
  ReturnDocStatus,
  ProductType,
} from '@prisma/client';

describe('Purchase Returns (Yetkazib Beruvchiga Qaytarish) Comprehensive Invariant Test Suite (#108)', () => {
  let service: PurchasesService;
  let prisma: any;

  const tenantId = 'tenant-ret-test';
  const userId = 'user-ret-test';
  const warehouseId = 'wh-central';
  const counterpartyId = 'supp-main';

  beforeEach(async () => {
    prisma = {
      purchaseReceipt: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      purchaseReceiptItem: {
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      purchaseExpense: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      purchaseReturn: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      purchaseReturnItem: {
        deleteMany: jest.fn(),
      },
      productBatch: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      stockLevel: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      counterparty: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      account: {
        findFirst: jest.fn(),
      },
      journalEntry: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      financeTransaction: {
        findFirst: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PurchasesService>(PurchasesService);
  });

  // ─── TICKET #109: RECEIPT-LINKED RETURNS & RETURN QUANTITY INVARIANT ─
  describe('Ticket #109: Receipt-Linked Returns & Return Quantity Invariant', () => {
    it('should create and post a linked return, decrement stock, consume batch, and update receipt returnStatus', async () => {
      const receipt = {
        id: 'rec-100',
        tenantId,
        status: PurchaseDocStatus.POSTED,
        totalAmount: 1120000,
        returns: [],
        items: [
          {
            id: 'item-100',
            productId: 'prod-iphone',
            quantity: 10,
            returnedQuantity: 0,
            unitPrice: 100000,
            landedCost: 100000,
            vatRate: 12,
            product: { id: 'prod-iphone', type: ProductType.PRODUCT },
          },
        ],
        batches: [
          {
            id: 'batch-100',
            productId: 'prod-iphone',
            remainingQty: 10,
            initialQty: 10,
            purchasePrice: 100000,
            landedCost: 100000,
          },
        ],
      };

      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-iphone',
        type: ProductType.PRODUCT,
        name: 'iPhone 15 Pro',
      });
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-iphone',
        quantity: 10,
      });
      prisma.purchaseReceipt.findUnique.mockResolvedValue(receipt);
      prisma.purchaseReturn.create.mockImplementation(({ data }: { data: any }) => ({
        id: 'ret-100',
        ...data,
      }));
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.findMany.mockResolvedValue([
        { id: 'item-100', quantity: 10, returnedQuantity: 3 },
      ]);
      prisma.productBatch.update.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockResolvedValue({});
      prisma.account.findFirst.mockImplementation(({ where }: { where: any }) => ({
        id: `acc-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      const pReturn = await service.createReturn(tenantId, userId, {
        receiptId: 'rec-100',
        counterpartyId,
        warehouseId,
        reason: 'DEFECT',
        actNumber: 'AKT-001',
        items: [{ productId: 'prod-iphone', quantity: 3, unitPrice: 100000, vatRate: 12 }],
      });

      expect(pReturn).toBeDefined();

      // Invariant Check 1: Warehouse stock decremented by 3
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-iphone' },
        data: { quantity: { decrement: 3 } },
      });

      // Invariant Check 2: Batch remaining quantity reduced by 3 (10 -> 7)
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-100' },
        data: { remainingQty: 7 },
      });

      // Invariant Check 3: Receipt item returnedQuantity tracked
      expect(prisma.purchaseReceiptItem.update).toHaveBeenCalledWith({
        where: { id: 'item-100' },
        data: { returnedQuantity: { increment: 3 } },
      });

      // Invariant Check 4: Supplier debt reduced by base price + VAT: 3 * 100,000 + 12% = 336,000
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: counterpartyId },
        data: {
          supplierDebt: { decrement: 336000 },
          debtBalance: { decrement: 336000 },
        },
      });

      // Invariant Check 5: Receipt returnStatus updated to PARTIALLY_RETURNED
      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { id: 'rec-100' },
        data: { returnStatus: PurchaseReturnStatus.PARTIALLY_RETURNED },
      });
    });

    it('should reject return if quantity exceeds unreturned receipt quantity', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-iphone',
        type: ProductType.PRODUCT,
        name: 'iPhone 15 Pro',
      });
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-iphone',
        quantity: 10,
      });
      prisma.purchaseReceipt.findUnique.mockResolvedValue({
        id: 'rec-100',
        status: PurchaseDocStatus.POSTED,
        items: [
          {
            id: 'item-100',
            productId: 'prod-iphone',
            quantity: 10,
            returnedQuantity: 8, // only 2 left unreturned
          },
        ],
        batches: [{ id: 'batch-100', productId: 'prod-iphone', remainingQty: 10 }],
      });

      await expect(
        service.createReturn(tenantId, userId, {
          receiptId: 'rec-100',
          counterpartyId,
          warehouseId,
          items: [{ productId: 'prod-iphone', quantity: 5, unitPrice: 100000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject return if items were already sold (remaining batch qty < return qty)', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-iphone',
        type: ProductType.PRODUCT,
        name: 'iPhone 15 Pro',
      });
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-iphone',
        quantity: 10,
      });
      prisma.purchaseReceipt.findUnique.mockResolvedValue({
        id: 'rec-100',
        status: PurchaseDocStatus.POSTED,
        items: [
          {
            id: 'item-100',
            productId: 'prod-iphone',
            quantity: 10,
            returnedQuantity: 0,
          },
        ],
        batches: [
          {
            id: 'batch-100',
            productId: 'prod-iphone',
            remainingQty: 2, // 8 were sold via sales invoices
          },
        ],
      });

      await expect(
        service.createReturn(tenantId, userId, {
          receiptId: 'rec-100',
          counterpartyId,
          warehouseId,
          items: [{ productId: 'prod-iphone', quantity: 5, unitPrice: 100000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject return if on-hand warehouse stock is lower than return quantity', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-iphone',
        type: ProductType.PRODUCT,
        name: 'iPhone 15 Pro',
      });
      // Warehouse stock is only 2
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-iphone',
        quantity: 2,
      });

      await expect(
        service.createReturn(tenantId, userId, {
          counterpartyId,
          warehouseId,
          items: [{ productId: 'prod-iphone', quantity: 5, unitPrice: 100000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── TICKET #110: STANDALONE RETURNS & FIFO BATCH CONSUMPTION ─────
  describe('Ticket #110: Standalone Returns & FIFO Batch Valuation', () => {
    it('should create and post a standalone return, consuming FIFO batches from warehouse inventory', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'raw-alu',
        type: ProductType.RAW_MATERIAL,
        name: 'Alyumin profil',
      });
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-alu',
        quantity: 100,
      });
      prisma.purchaseReturn.create.mockImplementation(({ data }: { data: any }) => ({
        id: 'ret-standalone-1',
        ...data,
      }));
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});

      // Two active FIFO batches in the warehouse
      const batch1 = { id: 'b1', initialQty: 15, remainingQty: 10, purchasePrice: 40000, landedCost: 40000 };
      const batch2 = { id: 'b2', initialQty: 20, remainingQty: 20, purchasePrice: 45000, landedCost: 45000 };
      prisma.productBatch.findMany.mockResolvedValue([batch1, batch2]);
      prisma.productBatch.update.mockResolvedValue({});
      prisma.account.findFirst.mockImplementation(({ where }: { where: any }) => ({
        id: `acc-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      const pReturn = await service.createReturn(tenantId, userId, {
        counterpartyId,
        warehouseId,
        reason: 'EXCESS_STOCK',
        items: [{ productId: 'raw-alu', quantity: 15, unitPrice: 40000, vatRate: 0 }],
      });

      expect(pReturn).toBeDefined();

      // Warehouse stock decremented by 15
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-alu' },
        data: { quantity: { decrement: 15 } },
      });

      // FIFO batch consumption: consumes all 10 from batch1, then 5 from batch2
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { remainingQty: { decrement: 10 } },
      });
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { id: 'b2' },
        data: { remainingQty: { decrement: 5 } },
      });

      // Supplier debt reduced by 15 * 40,000 = 600,000
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: counterpartyId },
        data: {
          supplierDebt: { decrement: 600000 },
          debtBalance: { decrement: 600000 },
        },
      });
    });
  });

  // ─── TICKET #111: LANDED COST VARIANCE (ADR 0009) & CANCELLATION ───
  describe('Ticket #111: Landed Cost Return Variance (ADR 0009) & Symmetrical Cancellation', () => {
    it('should write off Landed Cost Return Variance to 9430 without distorting supplier debt', async () => {
      // Item purchased at 100,000 UZS base, but landedCost was 120,000 UZS (20,000 freight allocated)
      const receipt = {
        id: 'rec-freight',
        tenantId,
        status: PurchaseDocStatus.POSTED,
        totalAmount: 1120000,
        returns: [],
        items: [
          {
            id: 'item-fr',
            productId: 'prod-item',
            quantity: 10,
            returnedQuantity: 0,
            unitPrice: 100000,
            landedCost: 1200000, // unit landed cost = 120,000
            vatRate: 0,
            product: { id: 'prod-item', type: ProductType.PRODUCT },
          },
        ],
        batches: [
          {
            id: 'batch-fr',
            productId: 'prod-item',
            remainingQty: 10,
            initialQty: 10,
            purchasePrice: 100000,
            landedCost: 1200000,
          },
        ],
      };

      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-item',
        type: ProductType.PRODUCT,
        name: 'Imported Widget',
      });
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-item',
        quantity: 10,
      });
      prisma.purchaseReceipt.findUnique.mockResolvedValue(receipt);
      prisma.purchaseReturn.create.mockImplementation(({ data }: { data: any }) => ({
        id: 'ret-variance',
        ...data,
      }));
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.findMany.mockResolvedValue([
        { id: 'item-fr', quantity: 10, returnedQuantity: 5 },
      ]);
      prisma.productBatch.update.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockResolvedValue({});
      prisma.account.findFirst.mockImplementation(({ where }: { where: any }) => ({
        id: `acc-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      await service.createReturn(tenantId, userId, {
        receiptId: 'rec-freight',
        counterpartyId,
        warehouseId,
        reason: 'DEFECT',
        items: [{ productId: 'prod-item', quantity: 5, unitPrice: 100000, vatRate: 0 }],
      });

      // Supplier debt decreases strictly by base purchase price: 5 * 100,000 = 500,000
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: counterpartyId },
        data: {
          supplierDebt: { decrement: 500000 },
          debtBalance: { decrement: 500000 },
        },
      });

      // Check Journal Entry for Landed Cost Return Variance (Account 9430)
      expect(prisma.journalEntry.create).toHaveBeenCalled();
      const jeCreate = prisma.journalEntry.create.mock.calls[0][0];
      const lines = jeCreate.data.lines.create;

      // 1. Inventory credited at landed cost: 5 * 120,000 = 600,000 (Dt 6010 / Kt 2910)
      expect(lines.find((l: any) => l.debitAccountId === 'acc-6010' && l.creditAccountId === 'acc-2910')?.amount).toBe(600000);

      // 2. Variance loss recognized: 600,000 - 500,000 = 100,000 (Dt 9430 / Kt 2910)
      const varianceLine = lines.find((l: any) => l.debitAccountId === 'acc-9430' && l.creditAccountId === 'acc-2910');
      expect(varianceLine).toBeDefined();
      expect(varianceLine.amount).toBe(100000);
    });

    it('should atomically cancel a posted return, restoring stock, batch, and supplier debt', async () => {
      const pReturn = {
        id: 'ret-cancel-test',
        tenantId,
        returnNumber: 'RET-2026-0005',
        status: ReturnDocStatus.POSTED,
        warehouseId,
        counterpartyId,
        receiptId: 'rec-100',
        items: [
          {
            id: 'ri-1',
            productId: 'prod-item',
            quantity: 5,
            totalPrice: 500000,
          },
        ],
        receipt: {
          id: 'rec-100',
          items: [{ id: 'item-100', productId: 'prod-item', returnedQuantity: 5 }],
          batches: [{ id: 'batch-100', productId: 'prod-item', remainingQty: 5 }],
        },
      };

      prisma.purchaseReturn.findFirst.mockResolvedValue(pReturn);
      prisma.financeTransaction.findFirst.mockResolvedValue(null); // no linked cash refunds
      prisma.stockLevel.findUnique.mockResolvedValue({ id: 'stock-item', quantity: 15 });
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.productBatch.update.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.findMany.mockResolvedValue([
        { id: 'item-100', returnedQuantity: 0 },
      ]);
      prisma.purchaseReceipt.update.mockResolvedValue({});
      prisma.journalEntry.deleteMany.mockResolvedValue({});
      prisma.purchaseReturn.update.mockImplementation(({ data }: { data: any }) => ({
        ...pReturn,
        ...data,
      }));
      prisma.auditLog.create.mockResolvedValue({});

      const cancelled = await service.cancelReturn(tenantId, userId, 'ret-cancel-test');

      expect(cancelled.status).toBe(ReturnDocStatus.CANCELLED);

      // 1. Stock re-incremented by 5 (15 -> 20)
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-item' },
        data: { quantity: { increment: 5 } },
      });

      // 2. Batch re-incremented by 5
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-100' },
        data: { remainingQty: { increment: 5 } },
      });

      // 3. Receipt item returnedQuantity decremented
      expect(prisma.purchaseReceiptItem.update).toHaveBeenCalledWith({
        where: { id: 'item-100' },
        data: { returnedQuantity: { decrement: 5 } },
      });

      // 4. Supplier debt restored
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: counterpartyId },
        data: {
          supplierDebt: { increment: 500000 },
          debtBalance: { increment: 500000 },
        },
      });

      // 5. Receipt returnStatus restored to NONE
      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { id: 'rec-100' },
        data: { returnStatus: PurchaseReturnStatus.NONE },
      });

      // 6. Linked journal entries deleted
      expect(prisma.journalEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          sourceDocType: 'PurchaseReturn',
          sourceDocId: 'ret-cancel-test',
        },
      });
    });

    it('should block cancellation if linked cash refund transactions exist in Finance', async () => {
      prisma.purchaseReturn.findFirst.mockResolvedValue({
        id: 'ret-paid-refund',
        tenantId,
        returnNumber: 'RET-2026-0009',
        status: ReturnDocStatus.POSTED,
        counterpartyId,
      });

      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'fin-refund-1',
        direction: 'INCOME',
      });

      await expect(
        service.cancelReturn(tenantId, userId, 'ret-paid-refund'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
