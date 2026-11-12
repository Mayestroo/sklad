import { Test, TestingModule } from '@nestjs/testing';
import { PurchasesService } from './purchases.service';
import { PrismaService } from '../../common/prisma';
import { BadRequestException } from '@nestjs/common';
import {
  PurchaseDocStatus,
  PurchaseReturnStatus,
  ReturnDocStatus,
  ProductType,
  CounterpartySettlementSide,
} from '@prisma/client';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../settlements/settlement-allocation.service';
import { AccountsService } from '../accounting/accounts/accounts.service';
import { JournalService } from '../accounting/journal/journal.service';

jest.mock('../../common/sequences/document-sequence');

describe('Purchase Returns (Yetkazib Beruvchiga Qaytarish) Comprehensive Invariant Test Suite (#108)', () => {
  let service: PurchasesService;
  let prisma: any;
  let settlementService: { recordMovement: jest.Mock };
  let settlementAllocationService: { recordAllocation: jest.Mock };

  const tenantId = 'tenant-ret-test';
  const userId = 'user-ret-test';
  const warehouseId = 'wh-central';
  const counterpartyId = 'supp-main';

  beforeEach(async () => {
    settlementService = {
      recordMovement: jest.fn().mockResolvedValue({ created: true }),
    };
    settlementAllocationService = {
      recordAllocation: jest.fn().mockResolvedValue({ created: true }),
    };
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
      batchConsumption: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      productBatch: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
        update: jest.fn(),
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
        JournalService,
        PurchasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CounterpartySettlementService, useValue: settlementService },
        {
          provide: SettlementAllocationService,
          useValue: settlementAllocationService,
        },
        {
          provide: AccountsService,
          useValue: { ensureDefaultAccounts: jest.fn() },
        },
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
        counterpartyId,
        warehouseId,
        currency: 'UZS',
        exchangeRate: 1,
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
            createdAt: new Date('2026-01-01T00:00:01Z'),
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
      prisma.purchaseReceipt.findFirst.mockResolvedValue(receipt);
      prisma.productBatch.findMany.mockResolvedValue(receipt.batches ?? []);
      prisma.purchaseReturn.create.mockImplementation(
        ({ data }: { data: any }) => ({
          id: 'ret-100',
          ...data,
        }),
      );
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.findMany.mockResolvedValue([
        { id: 'item-100', quantity: 10, returnedQuantity: 3 },
      ]);
      prisma.productBatch.update.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockResolvedValue({});
      prisma.account.findFirst.mockImplementation(
        ({ where }: { where: any }) => ({
          id: `acc-${where.code}`,
          code: where.code,
        }),
      );
      prisma.journalEntry.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      const pReturn = await service.createReturn(tenantId, userId, {
        receiptId: 'rec-100',
        counterpartyId,
        warehouseId,
        currency: 'UZS',
        reason: 'DEFECT',
        actNumber: 'AKT-001',
        items: [
          {
            productId: 'prod-iphone',
            quantity: 3,
            unitPrice: 100000,
            vatRate: 12,
          },
        ],
      });

      expect(pReturn).toBeDefined();

      // Invariant Check 1: Warehouse stock decremented by 3
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-ret-test',
          id: 'stock-iphone',
        },
        data: { quantity: { decrement: 3 } },
      });

      // Invariant Check 2: Batch remaining quantity reduced by 3 (10 -> 7)
      expect(prisma.productBatch.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-ret-test',
          id: 'batch-100',
          remainingQty: { gte: 3 },
        },
        data: { remainingQty: { decrement: 3 } },
      });

      // Invariant Check 3: Receipt item returnedQuantity tracked
      expect(prisma.purchaseReceiptItem.update).toHaveBeenCalledWith({
        where: { receipt: { tenantId: 'tenant-ret-test' }, id: 'item-100' },
        data: { returnedQuantity: { increment: 3 } },
      });

      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId,
          counterpartyId,
          currency: 'UZS',
          side: CounterpartySettlementSide.SUPPLIER,
          amount: -336000,
          entryType: 'PURCHASE_RETURN_POSTED',
          sourceDocType: 'PurchaseReturn',
          sourceDocId: 'ret-100',
        }),
      );

      // Invariant Check 5: Receipt returnStatus updated to PARTIALLY_RETURNED
      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-ret-test', id: 'rec-100' },
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
      prisma.purchaseReceipt.findFirst.mockResolvedValue({
        id: 'rec-100',
        counterpartyId,
        warehouseId,
        currency: 'UZS',
        exchangeRate: 1,
        status: PurchaseDocStatus.POSTED,
        items: [
          {
            id: 'item-100',
            productId: 'prod-iphone',
            quantity: 10,
            returnedQuantity: 8, // only 2 left unreturned
          },
        ],
        batches: [
          {
            id: 'batch-100',
            productId: 'prod-iphone',
            remainingQty: 10,
            landedCost: 100000,
            purchasePrice: 100000,
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
        ],
      });

      await expect(
        service.createReturn(tenantId, userId, {
          receiptId: 'rec-100',
          counterpartyId,
          warehouseId,
          currency: 'UZS',
          items: [{ productId: 'prod-iphone', quantity: 5, unitPrice: 100000 }],
        }),
      ).rejects.toThrow('qolgan qaytarilmagan miqdordan');
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
      prisma.purchaseReceipt.findFirst.mockResolvedValue({
        id: 'rec-100',
        counterpartyId,
        warehouseId,
        currency: 'UZS',
        exchangeRate: 1,
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
          currency: 'UZS',
          items: [{ productId: 'prod-iphone', quantity: 5, unitPrice: 100000 }],
        }),
      ).rejects.toThrow('partiyada qolgan miqdordan');
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
          currency: 'UZS',
          items: [{ productId: 'prod-iphone', quantity: 5, unitPrice: 100000 }],
        }),
      ).rejects.toThrow('omborda mavjud qoldiqdan (2)');
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
      prisma.purchaseReturn.create.mockImplementation(
        ({ data }: { data: any }) => ({
          id: 'ret-standalone-1',
          ...data,
        }),
      );
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});

      // Two active FIFO batches in the warehouse
      const batch1 = {
        id: 'b1',
        createdAt: new Date('2026-01-01T00:00:02Z'),
        initialQty: 15,
        remainingQty: 10,
        purchasePrice: 40000,
        landedCost: 40000,
      };
      const batch2 = {
        id: 'b2',
        createdAt: new Date('2026-01-01T00:00:03Z'),
        initialQty: 20,
        remainingQty: 20,
        purchasePrice: 45000,
        landedCost: 45000,
      };
      prisma.productBatch.findMany.mockResolvedValue([batch1, batch2]);
      prisma.productBatch.update.mockResolvedValue({});
      prisma.account.findFirst.mockImplementation(
        ({ where }: { where: any }) => ({
          id: `acc-${where.code}`,
          code: where.code,
        }),
      );
      prisma.journalEntry.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      const pReturn = await service.createReturn(tenantId, userId, {
        counterpartyId,
        warehouseId,
        reason: 'EXCESS_STOCK',
        currency: 'UZS',
        items: [
          { productId: 'raw-alu', quantity: 15, unitPrice: 40000, vatRate: 0 },
        ],
      });

      expect(pReturn).toBeDefined();

      // Warehouse stock decremented by 15
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-ret-test',
          id: 'stock-alu',
        },
        data: { quantity: { decrement: 15 } },
      });

      // FIFO batch consumption: consumes all 10 from batch1, then 5 from batch2
      expect(prisma.productBatch.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-ret-test',
          id: 'b1',
          remainingQty: { gte: 10 },
        },
        data: { remainingQty: { decrement: 10 } },
      });
      expect(prisma.productBatch.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-ret-test',
          id: 'b2',
          remainingQty: { gte: 5 },
        },
        data: { remainingQty: { decrement: 5 } },
      });

      // Inventory leaves at FIFO batch cost: 10 x 40,000 + 5 x 45,000 =
      // 625,000. The supplier takes it back at 15 x 40,000 = 600,000; the
      // 25,000 above that is a loss (ADR 0009). 2910 is credited once.
      const standaloneLines =
        prisma.journalEntry.create.mock.calls[0][0].data.lines.create;
      expect(standaloneLines).toEqual([
        expect.objectContaining({
          debitAccountId: 'acc-6010',
          creditAccountId: 'acc-2910',
          amount: 600000,
        }),
        expect.objectContaining({
          debitAccountId: 'acc-9430',
          creditAccountId: 'acc-2910',
          amount: 25000,
        }),
      ]);

      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId,
          counterpartyId,
          currency: 'UZS',
          side: CounterpartySettlementSide.SUPPLIER,
          amount: -600000,
          entryType: 'PURCHASE_RETURN_POSTED',
          sourceDocType: 'PurchaseReturn',
          sourceDocId: 'ret-standalone-1',
        }),
      );
    });
  });

  // ─── TICKET #111: LANDED COST VARIANCE (ADR 0009) & CANCELLATION ───
  describe('Ticket #111: Landed Cost Return Variance (ADR 0009) & Symmetrical Cancellation', () => {
    it('should write off Landed Cost Return Variance to 9430 without distorting supplier debt', async () => {
      // Item purchased at 100,000 UZS base, but landedCost was 120,000 UZS (20,000 freight allocated)
      const receipt = {
        id: 'rec-freight',
        tenantId,
        counterpartyId,
        warehouseId,
        currency: 'UZS',
        exchangeRate: 1,
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
            landedCost: 120000, // unit landed cost = 120,000
            vatRate: 0,
            product: { id: 'prod-item', type: ProductType.PRODUCT },
          },
        ],
        batches: [
          {
            id: 'batch-fr',
            createdAt: new Date('2026-01-01T00:00:04Z'),
            productId: 'prod-item',
            remainingQty: 10,
            initialQty: 10,
            purchasePrice: 100000,
            landedCost: 120000,
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
      prisma.purchaseReceipt.findFirst.mockResolvedValue(receipt);
      prisma.productBatch.findMany.mockResolvedValue(receipt.batches ?? []);
      prisma.purchaseReturn.create.mockImplementation(
        ({ data }: { data: any }) => ({
          id: 'ret-variance',
          ...data,
        }),
      );
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.findMany.mockResolvedValue([
        { id: 'item-fr', quantity: 10, returnedQuantity: 5 },
      ]);
      prisma.productBatch.update.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockResolvedValue({});
      prisma.account.findFirst.mockImplementation(
        ({ where }: { where: any }) => ({
          id: `acc-${where.code}`,
          code: where.code,
        }),
      );
      prisma.journalEntry.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      await service.createReturn(tenantId, userId, {
        receiptId: 'rec-freight',
        counterpartyId,
        warehouseId,
        currency: 'UZS',
        reason: 'DEFECT',
        items: [
          {
            productId: 'prod-item',
            quantity: 5,
            unitPrice: 100000,
            vatRate: 0,
          },
        ],
      });

      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId,
          counterpartyId,
          currency: 'UZS',
          side: CounterpartySettlementSide.SUPPLIER,
          amount: -500000,
          entryType: 'PURCHASE_RETURN_POSTED',
          sourceDocType: 'PurchaseReturn',
          sourceDocId: 'ret-variance',
        }),
      );

      // Check Journal Entry for Landed Cost Return Variance (Account 9430)
      expect(prisma.journalEntry.create).toHaveBeenCalled();
      const jeCreate = prisma.journalEntry.create.mock.calls[0][0];
      const lines = jeCreate.data.lines.create;

      // 1. Supplier payable falls by the base price: 5 * 100,000 = 500,000 (Dt 6010 / Kt 2910)
      expect(
        lines.find(
          (l: any) =>
            l.debitAccountId === 'acc-6010' && l.creditAccountId === 'acc-2910',
        )?.amount,
      ).toBe(500000);

      // 2. Variance loss recognized: 600,000 - 500,000 = 100,000 (Dt 9430 / Kt 2910)
      const varianceLine = lines.find(
        (l: any) =>
          l.debitAccountId === 'acc-9430' && l.creditAccountId === 'acc-2910',
      );
      expect(varianceLine).toBeDefined();
      expect(varianceLine.amount).toBe(100000);

      // 3. Together 2910 is credited exactly the landed cost that left: 5 * 120,000.
      const inventoryCredit = lines
        .filter((l: any) => l.creditAccountId === 'acc-2910')
        .reduce((sum: number, l: any) => sum + l.amount, 0);
      expect(inventoryCredit).toBe(600000);
    });

    it('should atomically cancel a posted return, restoring stock, batch, and supplier debt', async () => {
      const pReturn = {
        id: 'ret-cancel-test',
        tenantId,
        returnNumber: 'RET-2026-0005',
        returnDate: new Date('2026-09-20'),
        status: ReturnDocStatus.POSTED,
        warehouseId,
        counterpartyId,
        currency: 'UZS',
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
          items: [
            { id: 'item-100', productId: 'prod-item', returnedQuantity: 5 },
          ],
          batches: [
            {
              id: 'batch-100',
              productId: 'prod-item',
              remainingQty: 5,
              landedCost: 100000,
              purchasePrice: 100000,
              createdAt: new Date('2026-01-01T00:00:00Z'),
            },
          ],
        },
      };

      prisma.purchaseReturn.findFirst.mockResolvedValue(pReturn);
      prisma.financeTransaction.findFirst.mockResolvedValue(null); // no linked cash refunds
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-item',
        quantity: 15,
      });
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.productBatch.update.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.findMany.mockResolvedValue([
        { id: 'item-100', returnedQuantity: 0 },
      ]);
      prisma.purchaseReceipt.update.mockResolvedValue({});
      prisma.journalEntry.deleteMany.mockResolvedValue({});
      prisma.purchaseReturn.update.mockImplementation(
        ({ data }: { data: any }) => ({
          ...pReturn,
          ...data,
        }),
      );
      prisma.auditLog.create.mockResolvedValue({});

      prisma.batchConsumption.findMany.mockResolvedValue([
        { id: 'bc-1', batchId: 'batch-100', quantity: 5 },
      ]);

      const cancelled = await service.cancelReturn(
        tenantId,
        userId,
        'ret-cancel-test',
      );

      expect(cancelled.status).toBe(ReturnDocStatus.CANCELLED);

      // 1. Stock re-incremented by 5 (15 -> 20)
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-ret-test',
          id: 'stock-item',
        },
        data: { quantity: { increment: 5 } },
      });

      // 2. Exactly the recorded consumption is put back, then forgotten
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-ret-test', id: 'batch-100' },
        data: { remainingQty: { increment: 5 } },
      });
      expect(prisma.batchConsumption.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, purchaseReturnItemId: expect.any(String) },
      });

      // 3. Receipt item returnedQuantity decremented
      expect(prisma.purchaseReceiptItem.update).toHaveBeenCalledWith({
        where: { receipt: { tenantId: 'tenant-ret-test' }, id: 'item-100' },
        data: { returnedQuantity: { decrement: 5 } },
      });

      // 4. Supplier debt restored
      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId,
          counterpartyId,
          currency: 'UZS',
          side: CounterpartySettlementSide.SUPPLIER,
          amount: 500000,
          entryType: 'PURCHASE_RETURN_CANCELLED',
          sourceDocType: 'PurchaseReturn',
          sourceDocId: 'ret-cancel-test',
        }),
      );

      // 5. Receipt returnStatus restored to NONE
      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-ret-test', id: 'rec-100' },
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

  // ─── USD RETURNS: THE JOURNAL IS IN UZS (ADR 0006, ADR 0009) ───────
  describe('USD purchase returns post their journal in UZS', () => {
    type Line = {
      debitAccountId: string;
      creditAccountId: string;
      amount: number;
    };

    const journalLines = (): Line[] =>
      prisma.journalEntry.create.mock.calls[0][0].data.lines.create;
    const credited = (lines: Line[], account: string) =>
      lines
        .filter((l) => l.creditAccountId === account)
        .reduce((sum, l) => sum + Number(l.amount), 0);
    const debited = (lines: Line[], account: string) =>
      lines
        .filter((l) => l.debitAccountId === account)
        .reduce((sum, l) => sum + Number(l.amount), 0);

    beforeEach(() => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-usd',
        type: ProductType.PRODUCT,
        name: 'Imported Pump',
      });
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-usd',
        quantity: 10,
      });
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockResolvedValue({});
      prisma.productBatch.update.mockResolvedValue({});
      prisma.account.findFirst.mockImplementation(
        ({ where }: { where: any }) => ({
          id: `acc-${where.code}`,
          code: where.code,
        }),
      );
      prisma.journalEntry.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
    });

    it('receipt-linked: converts base and VAT at the receipt rate; inventory leaves at landed cost', async () => {
      // Bought at 10 USD + 12% VAT, rate 12,500. Freight made the landed cost
      // 130,000 UZS per unit (landedCost is per unit, in UZS).
      const receipt = {
        id: 'rec-usd',
        tenantId,
        counterpartyId,
        warehouseId,
        currency: 'USD',
        exchangeRate: 12500,
        status: PurchaseDocStatus.POSTED,
        returns: [],
        items: [
          {
            id: 'rec-usd-item',
            productId: 'prod-usd',
            quantity: 10,
            returnedQuantity: 0,
            unitPrice: 10,
            landedCost: 130000,
            vatRate: 12,
            product: { id: 'prod-usd', type: ProductType.PRODUCT },
          },
        ],
        batches: [
          {
            id: 'batch-usd',
            productId: 'prod-usd',
            warehouseId,
            createdAt: new Date('2026-01-01T00:00:05Z'),
            remainingQty: 10,
            initialQty: 10,
            purchasePrice: 125000,
            landedCost: 130000,
          },
        ],
      };
      prisma.purchaseReceipt.findFirst.mockResolvedValue(receipt);
      prisma.productBatch.findMany.mockResolvedValue(receipt.batches);
      prisma.purchaseReceiptItem.findMany.mockResolvedValue([
        { id: 'rec-usd-item', quantity: 10, returnedQuantity: 5 },
      ]);
      prisma.purchaseReturn.create.mockImplementation(
        ({ data }: { data: any }) => ({ id: 'ret-usd-linked', ...data }),
      );

      await service.createReturn(tenantId, userId, {
        receiptId: 'rec-usd',
        counterpartyId,
        warehouseId,
        currency: 'USD',
        items: [
          { productId: 'prod-usd', quantity: 5, unitPrice: 10, vatRate: 12 },
        ],
      });

      // Supplier payable is settled in USD: 5 x 10 + 6 VAT.
      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ currency: 'USD', amount: -56 }),
      );

      const lines = journalLines();
      // 2910 credited with exactly what left: 5 x 130,000 UZS.
      expect(credited(lines, 'acc-2910')).toBe(650000);
      // 6010 debited with the payable reduction at the receipt rate: 56 x 12,500.
      expect(debited(lines, 'acc-6010')).toBe(700000);
      // VAT reversed in UZS: 6 x 12,500.
      expect(credited(lines, 'acc-4410')).toBe(75000);
      // Non-refundable freight: 650,000 - 50 x 12,500.
      expect(debited(lines, 'acc-9430')).toBe(25000);
      expect(lines.every((l) => l.debitAccountId !== l.creditAccountId)).toBe(
        true,
      );
    });

    it('standalone: requires a rate, converts at it, and inventory leaves at FIFO cost', async () => {
      prisma.productBatch.findMany.mockResolvedValue([
        {
          id: 'fifo-usd',
          createdAt: new Date('2026-01-01T00:00:06Z'),
          initialQty: 10,
          remainingQty: 10,
          purchasePrice: 125000,
          landedCost: 130000,
        },
      ]);
      prisma.purchaseReturn.create.mockImplementation(
        ({ data }: { data: any }) => ({ id: 'ret-usd-standalone', ...data }),
      );

      await expect(
        service.createReturn(tenantId, userId, {
          counterpartyId,
          warehouseId,
          currency: 'USD',
          items: [{ productId: 'prod-usd', quantity: 2, unitPrice: 10 }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.purchaseReturn.create).not.toHaveBeenCalled();

      await service.createReturn(tenantId, userId, {
        counterpartyId,
        warehouseId,
        currency: 'USD',
        exchangeRate: 12600,
        items: [{ productId: 'prod-usd', quantity: 2, unitPrice: 10 }],
      });

      expect(prisma.purchaseReturn.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currency: 'USD',
            exchangeRate: 12600,
          }),
        }),
      );
      const lines = journalLines();
      // FIFO cost 2 x 130,000; payable reduction 20 USD x 12,600 = 252,000.
      expect(credited(lines, 'acc-2910')).toBe(260000);
      expect(debited(lines, 'acc-6010')).toBe(252000);
      expect(debited(lines, 'acc-9430')).toBe(8000);
    });
  });
});
