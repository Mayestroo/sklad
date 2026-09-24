import { Test, TestingModule } from '@nestjs/testing';
import { PurchasesService } from './purchases.service';
import { PrismaService } from '../../common/prisma';
import { BadRequestException } from '@nestjs/common';
import {
  PurchaseDocStatus,
  PurchasePaymentStatus,
  PurchaseReturnStatus,
  ProductType,
  CounterpartySettlementSide,
} from '@prisma/client';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../settlements/settlement-allocation.service';

describe('Ticket #107: Multi-Nomenclature Purchase Lifecycle & Invariant Test Suite', () => {
  let service: PurchasesService;
  let prisma: any;
  let settlementService: { recordMovement: jest.Mock };
  let settlementAllocationService: { recordAllocation: jest.Mock };

  const tenantId = 'tenant-xyz';
  const userId = 'user-abc';
  const warehouseId = 'wh-main';
  const counterpartyId = 'supplier-main';

  beforeEach(async () => {
    settlementService = { recordMovement: jest.fn().mockResolvedValue({ created: true }) };
    settlementAllocationService = { recordAllocation: jest.fn().mockResolvedValue({ created: true }) };
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
      additionalExpense: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      purchaseReturn: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
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
        { provide: CounterpartySettlementService, useValue: settlementService },
        { provide: SettlementAllocationService, useValue: settlementAllocationService },
      ],
    }).compile();

    service = module.get<PurchasesService>(PurchasesService);
  });

  describe('Heterogeneous Purchase Lifecycle: PRODUCT, RAW_MATERIAL, SERVICE', () => {
    it('should create draft receipt containing PRODUCT, RAW_MATERIAL, and SERVICE lines', async () => {
      const dto = {
        counterpartyId,
        warehouseId,
        currency: 'UZS',
        exchangeRate: 1,
        docDate: '2026-09-14',
        items: [
          {
            productId: 'prod-finish',
            quantity: 10,
            unitPrice: 500000,
            discount: 0,
            vatRate: 12,
          },
          {
            productId: 'raw-alu',
            quantity: 50,
            unitPrice: 40000,
            discount: 0,
            vatRate: 12,
          },
          {
            productId: 'srv-freight',
            quantity: 1,
            unitPrice: 300000,
            discount: 0,
            vatRate: 0,
          },
        ],
      };

      prisma.purchaseReceipt.create.mockImplementation(({ data }: { data: any }) => ({
        id: 'rec-hetero-1',
        ...data,
        status: PurchaseDocStatus.DRAFT,
        paymentStatus: PurchasePaymentStatus.UNPAID,
      }));

      const receipt = await service.createReceipt(tenantId, userId, dto as any);

      expect(receipt).toBeDefined();
      expect(prisma.purchaseReceipt.create).toHaveBeenCalled();
      const createdData = prisma.purchaseReceipt.create.mock.calls[0][0].data;

      // Subtotal: (10 * 500,000) + (50 * 40,000) + (1 * 300,000) = 5,000,000 + 2,000,000 + 300,000 = 7,300,000
      expect(createdData.subtotalAmount).toBe(7300000);
      // VAT: 12% of (5,000,000 + 2,000,000) = 840,000
      expect(createdData.vatAmount).toBe(840000);
      // Total: 7,300,000 + 840,000 = 8,140,000
      expect(createdData.totalAmount).toBe(8140000);
      expect(createdData.items.create).toHaveLength(3);
    });

    it('should post heterogeneous receipt: increment stock only for physical items, skip SERVICE, create batches, post exact GL accounts', async () => {
      const receipt = {
        id: 'rec-hetero-1',
        tenantId,
        docNumber: 'PUR-2026-0001',
        docDate: new Date('2026-09-14'),
        updatedAt: new Date('2026-09-23T12:00:00.000Z'),
        warehouseId,
        counterpartyId,
        currency: 'UZS',
        status: PurchaseDocStatus.DRAFT,
        subtotalAmount: 7300000,
        discountAmount: 0,
        vatAmount: 840000,
        additionalExpensesTotal: 0,
        totalAmount: 8140000,
        counterparty: { id: counterpartyId, name: 'Universal Supplies LLC' },
        items: [
          {
            id: 'item-prod',
            productId: 'prod-finish',
            quantity: 10,
            unitPrice: 500000,
            totalPrice: 5000000,
            landedCost: 500000,
            allocatedExpenses: 0,
            product: { id: 'prod-finish', type: ProductType.PRODUCT, name: { uz: 'LED Panel' } },
          },
          {
            id: 'item-raw',
            productId: 'raw-alu',
            quantity: 50,
            unitPrice: 40000,
            totalPrice: 2000000,
            landedCost: 40000,
            allocatedExpenses: 0,
            product: { id: 'raw-alu', type: ProductType.RAW_MATERIAL, name: { uz: 'Alyumin profil' } },
          },
          {
            id: 'item-srv',
            productId: 'srv-freight',
            quantity: 1,
            unitPrice: 300000,
            totalPrice: 300000,
            landedCost: 300000,
            allocatedExpenses: 0,
            product: { id: 'srv-freight', type: ProductType.SERVICE, name: { uz: 'Yuk tashish xizmati' } },
          },
        ],
        expenses: [],
      };

      prisma.purchaseReceipt.findFirst.mockResolvedValue(receipt);
      prisma.stockLevel.findUnique.mockImplementation(({ where }: { where: any }) => {
        if (where.tenantId_warehouseId_productId.productId === 'prod-finish') {
          return Promise.resolve({ id: 'stock-prod', quantity: 5 });
        }
        if (where.tenantId_warehouseId_productId.productId === 'raw-alu') {
          return Promise.resolve({ id: 'stock-raw', quantity: 100 });
        }
        return Promise.resolve(null);
      });
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.productBatch.create.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.account.findFirst.mockImplementation(({ where }: { where: any }) => ({
        id: `acc-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockImplementation(({ data }: { data: any }) => ({
        ...receipt,
        ...data,
      }));

      const posted = await service.postReceipt(tenantId, userId, 'rec-hetero-1');

      expect(posted.status).toBe(PurchaseDocStatus.POSTED);

      // 1. StockLevel invariant: incremented ONLY for PRODUCT and RAW_MATERIAL (2 times), NEVER for SERVICE
      expect(prisma.stockLevel.update).toHaveBeenCalledTimes(2);
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-prod' },
        data: { quantity: { increment: 10 } },
      });
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-raw' },
        data: { quantity: { increment: 50 } },
      });

      // 2. ProductBatch invariant: created ONLY for PRODUCT and RAW_MATERIAL (2 times)
      expect(prisma.productBatch.create).toHaveBeenCalledTimes(2);
      expect(prisma.productBatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-finish',
          initialQty: 10,
          remainingQty: 10,
          purchasePrice: 500000,
        }),
      });
      expect(prisma.productBatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'raw-alu',
          initialQty: 50,
          remainingQty: 50,
          purchasePrice: 40000,
        }),
      });

      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId,
        counterpartyId,
        currency: 'UZS',
        side: CounterpartySettlementSide.SUPPLIER,
        amount: 8140000,
        entryType: 'PURCHASE_RECEIPT_POSTED',
        sourceDocType: 'PurchaseReceipt',
        sourceDocId: 'rec-hetero-1',
      }));

      // 4. Double-Entry Accounting Invariant (BHMS NAS Standard)
      expect(prisma.journalEntry.create).toHaveBeenCalled();
      const jeCreate = prisma.journalEntry.create.mock.calls[0][0];
      const lines = jeCreate.data.lines.create;

      expect(lines).toHaveLength(4);
      // Dt 2910 (Finished goods) = 5,000,000 / Kt 6010
      expect(lines.find((l: any) => l.debitAccountId === 'acc-2910')?.amount).toBe(5000000);
      // Dt 1010 (Raw materials) = 2,000,000 / Kt 6010
      expect(lines.find((l: any) => l.debitAccountId === 'acc-1010')?.amount).toBe(2000000);
      // Dt 9420 (Administrative / Operating expense) = 300,000 / Kt 6010
      expect(lines.find((l: any) => l.debitAccountId === 'acc-9420')?.amount).toBe(300000);
      // Dt 4410 (Input VAT) = 840,000 / Kt 6010
      expect(lines.find((l: any) => l.debitAccountId === 'acc-4410')?.amount).toBe(840000);
    });

    it('should unpost heterogeneous receipt symmetrically: decrement stock ONLY for PRODUCT and RAW_MATERIAL, skip SERVICE, delete batches, reverse debt', async () => {
      const receipt = {
        id: 'rec-hetero-1',
        tenantId,
        docNumber: 'PUR-2026-0001',
        docDate: new Date('2026-09-14'),
        updatedAt: new Date('2026-09-23T12:00:00.000Z'),
        currency: 'UZS',
        status: PurchaseDocStatus.POSTED,
        paidAmount: 0,
        paymentStatus: PurchasePaymentStatus.UNPAID,
        returnStatus: PurchaseReturnStatus.NONE,
        warehouseId,
        counterpartyId,
        totalAmount: 8140000,
        items: [
          {
            id: 'item-prod',
            productId: 'prod-finish',
            quantity: 10,
            product: { id: 'prod-finish', type: ProductType.PRODUCT },
          },
          {
            id: 'item-raw',
            productId: 'raw-alu',
            quantity: 50,
            product: { id: 'raw-alu', type: ProductType.RAW_MATERIAL },
          },
          {
            id: 'item-srv',
            productId: 'srv-freight',
            quantity: 1,
            product: { id: 'srv-freight', type: ProductType.SERVICE },
          },
        ],
        counterparty: { id: counterpartyId },
      };

      prisma.purchaseReceipt.findFirst.mockResolvedValue(receipt);
      prisma.stockLevel.findUnique.mockImplementation(({ where }: { where: any }) => {
        if (where.tenantId_warehouseId_productId.productId === 'prod-finish') {
          return Promise.resolve({ id: 'stock-prod', quantity: 15 });
        }
        if (where.tenantId_warehouseId_productId.productId === 'raw-alu') {
          return Promise.resolve({ id: 'stock-raw', quantity: 150 });
        }
        return Promise.resolve(null);
      });
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.productBatch.deleteMany.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.journalEntry.deleteMany.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockImplementation(({ data }: { data: any }) => ({
        ...receipt,
        ...data,
      }));

      const unposted = await service.unpostReceipt(tenantId, userId, 'rec-hetero-1');

      expect(unposted.status).toBe(PurchaseDocStatus.DRAFT);

      // Stock decremented only for physical items (15 -> 5, 150 -> 100), NEVER called for SERVICE
      expect(prisma.stockLevel.update).toHaveBeenCalledTimes(2);
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-prod' },
        data: { quantity: 5 },
      });
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-raw' },
        data: { quantity: 100 },
      });

      // Product batches deleted
      expect(prisma.productBatch.deleteMany).toHaveBeenCalledWith({
        where: { receiptId: 'rec-hetero-1' },
      });

      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId,
        counterpartyId,
        currency: 'UZS',
        side: CounterpartySettlementSide.SUPPLIER,
        amount: -8140000,
        entryType: 'PURCHASE_RECEIPT_UNPOSTED',
        sourceDocType: 'PurchaseReceipt',
        sourceDocId: 'rec-hetero-1',
      }));

      // Journal entries removed
      expect(prisma.journalEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          sourceDocType: 'PurchaseReceipt',
          sourceDocId: 'rec-hetero-1',
        },
      });
    });

    it('should strictly reject creating purchase returns for SERVICE lines', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'srv-freight',
        type: ProductType.SERVICE,
        name: 'Yuk tashish xizmati',
      });
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-srv',
        quantity: 1,
      });

      await expect(
        service.createReturn(tenantId, userId, {
          counterpartyId,
          warehouseId,
          items: [{ productId: 'srv-freight', quantity: 1, unitPrice: 300000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should permit returning RAW_MATERIAL lines within valid stock & batch limits', async () => {
      prisma.purchaseReturn.count.mockResolvedValue(0);
      prisma.purchaseReturn.create.mockImplementation(({ data }: { data: any }) => ({
        id: 'ret-raw-1',
        ...data,
      }));
      prisma.product.findFirst.mockResolvedValue({
        id: 'raw-alu',
        type: ProductType.RAW_MATERIAL,
        name: 'Alyumin profil',
      });
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-raw',
        quantity: 100,
      });
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.purchaseReceipt.findFirst.mockResolvedValue({
        id: 'rec-hetero-1',
        counterpartyId,
        warehouseId,
        currency: 'UZS',
        status: PurchaseDocStatus.POSTED,
        totalAmount: 8140000,
        returns: [],
        items: [
          {
            id: 'item-raw',
            productId: 'raw-alu',
            quantity: 50,
            returnedQuantity: 0,
            unitPrice: 40000,
            landedCost: 40000,
            product: { id: 'raw-alu', type: ProductType.RAW_MATERIAL },
          },
        ],
        batches: [
          {
            id: 'batch-raw',
            productId: 'raw-alu',
            remainingQty: 50,
            initialQty: 50,
            purchasePrice: 40000,
            landedCost: 40000,
          },
        ],
      });
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.findMany.mockResolvedValue([
        { id: 'item-raw', quantity: 50, returnedQuantity: 10 },
      ]);
      prisma.productBatch.update.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockResolvedValue({});
      prisma.account.findFirst.mockResolvedValue({ id: 'acc-1010', code: '1010' });
      prisma.journalEntry.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      const pReturn = await service.createReturn(tenantId, userId, {
        receiptId: 'rec-hetero-1',
        counterpartyId,
        warehouseId,
        currency: 'UZS',
        items: [{ productId: 'raw-alu', quantity: 10, unitPrice: 40000 }],
      });

      expect(pReturn).toBeDefined();
      // Stock decremented by 10
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-raw' },
        data: { quantity: { decrement: 10 } },
      });
      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId,
        counterpartyId,
        currency: 'UZS',
        side: CounterpartySettlementSide.SUPPLIER,
        amount: -400000,
        entryType: 'PURCHASE_RETURN_POSTED',
        sourceDocType: 'PurchaseReturn',
        sourceDocId: 'ret-raw-1',
      }));
    });
  });
});
