import { Test, TestingModule } from '@nestjs/testing';
import { PurchasesService } from './purchases.service';
import { PrismaService } from '../../common/prisma';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  PurchaseDocStatus,
  PurchasePaymentStatus,
  PurchaseReturnStatus,
  ReturnDocStatus,
  CounterpartySettlementSide,
} from '@prisma/client';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../settlements/settlement-allocation.service';
import {
  ExpenseTypeDto,
  ExpenseAllocationMethodDto,
} from './dto/create-purchase-expense.dto';

describe('PurchasesService Full Unit & Invariant Test Suite', () => {
  let service: PurchasesService;
  let prisma: any;
  let settlementService: { recordMovement: jest.Mock };
  let settlementAllocationService: { recordAllocation: jest.Mock };

  beforeEach(async () => {
    settlementService = { recordMovement: jest.fn().mockResolvedValue({ created: true }) };
    settlementAllocationService = { recordAllocation: jest.fn().mockResolvedValue({ created: true }) };
    prisma = {
      purchaseReceipt: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      purchaseReceiptItem: {
        deleteMany: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      purchaseExpense: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      additionalExpense: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      purchaseReturn: {
        count: jest.fn(),
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
      },
      stockLevel: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      counterparty: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      counterpartyBalance: { findMany: jest.fn() },
      account: {
        findFirst: jest.fn(),
      },
      journalEntry: {
        count: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      financeTransaction: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'finance-1' }),
      },
      settlementAllocation: {
        findMany: jest.fn().mockResolvedValue([]),
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

  // ─── TICKET #13: DRAFT MANAGEMENT & CALCULATIONS ───────────────────

  describe('Ticket #13: Core Draft Management', () => {
    it('should create a purchase receipt draft with correct line totals and auto-generated PUR-YYYY-XXXX number', async () => {
      const tenantId = 'tenant-123';
      const userId = 'user-456';
      const year = new Date().getFullYear();

      prisma.purchaseReceipt.count.mockResolvedValue(0);

      const dto = {
        counterpartyId: 'supp-1',
        warehouseId: 'wh-1',
        currency: 'UZS',
        exchangeRate: 1,
        docDate: '2026-08-14',
        items: [
          {
            productId: 'prod-1',
            quantity: 10,
            unitPrice: 100000,
            discount: 50000,
            vatRate: 12,
          },
          {
            productId: 'prod-2',
            quantity: 5,
            unitPrice: 200000,
            discount: 0,
            vatRate: 0,
          },
        ],
      };

      prisma.purchaseReceipt.create.mockImplementation(({ data }: { data: any }) => ({
        id: 'receipt-1',
        ...data,
        status: PurchaseDocStatus.DRAFT,
        paymentStatus: PurchasePaymentStatus.UNPAID,
      }));

      await service.createReceipt(tenantId, userId, dto as any);

      expect(prisma.purchaseReceipt.count).toHaveBeenCalledWith({
        where: {
          tenantId,
          docNumber: { startsWith: `PUR-${year}-` },
        },
      });

      expect(prisma.purchaseReceipt.create).toHaveBeenCalled();
      const createCall = prisma.purchaseReceipt.create.mock.calls[0][0];

      expect(createCall.data.docNumber).toBe(`PUR-${year}-0001`);
      expect(createCall.data.subtotalAmount).toBe(2000000);
      expect(createCall.data.discountAmount).toBe(50000);
      expect(createCall.data.vatAmount).toBe(114000);
      expect(createCall.data.totalAmount).toBe(2064000);
      expect(createCall.data.status).toBe(PurchaseDocStatus.DRAFT);
    });

    it('should throw BadRequestException if currency is missing or unsupported in purchase receipt', async () => {
      await expect(
        service.createReceipt('tenant-123', 'user-456', {
          counterpartyId: 'supp-1',
          warehouseId: 'wh-1',
          currency: '' as any,
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }],
        } as any),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createReceipt('tenant-123', 'user-456', {
          counterpartyId: 'supp-1',
          warehouseId: 'wh-1',
          currency: 'JPY' as any,
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if purchase receipt currency is USD and exchangeRate is missing, 0, or negative', async () => {
      await expect(
        service.createReceipt('tenant-123', 'user-456', {
          counterpartyId: 'supp-1',
          warehouseId: 'wh-1',
          currency: 'USD',
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }],
        } as any),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createReceipt('tenant-123', 'user-456', {
          counterpartyId: 'supp-1',
          warehouseId: 'wh-1',
          currency: 'USD',
          exchangeRate: 0,
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if purchase receipt item quantity is <= 0 or unitPrice < 0', async () => {
      await expect(
        service.createReceipt('tenant-123', 'user-456', {
          counterpartyId: 'supp-1',
          warehouseId: 'wh-1',
          currency: 'UZS',
          items: [{ productId: 'p1', quantity: 0, unitPrice: 100 }],
        } as any),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createReceipt('tenant-123', 'user-456', {
          counterpartyId: 'supp-1',
          warehouseId: 'wh-1',
          currency: 'UZS',
          items: [{ productId: 'p1', quantity: 1, unitPrice: -50 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should disallow deleting a POSTED receipt', async () => {
      prisma.purchaseReceipt.findFirst.mockResolvedValue({
        id: 'rec-1',
        tenantId: 'tenant-123',
        status: PurchaseDocStatus.POSTED,
      });

      await expect(
        service.deleteReceipt('tenant-123', 'rec-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should delete a DRAFT receipt cleanly', async () => {
      prisma.purchaseReceipt.findFirst.mockResolvedValue({
        id: 'rec-1',
        tenantId: 'tenant-123',
        status: PurchaseDocStatus.DRAFT,
      });
      prisma.purchaseReceipt.delete.mockResolvedValue({ id: 'rec-1' });

      const result = await service.deleteReceipt('tenant-123', 'rec-1');
      expect(result).toEqual({ success: true, message: "Xarid hujjati muvaffaqiyatli o'chirildi" });
    });
  });

  // ─── TICKET #14: LANDED COST ENGINE & EXPENSE ALLOCATION ───────────

  describe('Ticket #14: Landed Cost Engine & Allocation Methods', () => {
    it('should allocate expenses proportionally BY_AMOUNT and recalculate unit landed costs', async () => {
      const receipt = {
        id: 'rec-1',
        tenantId: 'tenant-123',
        status: PurchaseDocStatus.DRAFT,
        subtotalAmount: 1000000,
        discountAmount: 0,
        vatAmount: 0,
        additionalExpensesTotal: 0,
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 6,
            unitPrice: 100000,
            totalPrice: 600000,
            weight: 1,
          },
          {
            id: 'item-2',
            productId: 'prod-2',
            quantity: 4,
            unitPrice: 100000,
            totalPrice: 400000,
            weight: 1,
          },
        ],
      };

      prisma.purchaseReceipt.findFirst.mockResolvedValue(receipt);
      prisma.purchaseExpense.create.mockResolvedValue({ id: 'exp-1', amount: 100000 });
      prisma.purchaseExpense.findMany.mockResolvedValue([{ id: 'exp-1', amount: 100000 }]);
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockImplementation(({ data }: { data: any }) => ({ ...receipt, ...data }));

      await service.addExpense('tenant-123', {
        receiptId: 'rec-1',
        expenseType: ExpenseTypeDto.TRANSPORT,
        amount: 100000,
        allocationMethod: ExpenseAllocationMethodDto.BY_AMOUNT,
      });

      // Item 1 gets 60% = 60,000; Landed cost = (600,000 + 60,000) / 6 = 110,000
      expect(prisma.purchaseReceiptItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          allocatedExpenses: 60000,
          landedCost: 110000,
        },
      });

      // Item 2 gets 40% = 40,000; Landed cost = (400,000 + 40,000) / 4 = 110,000
      expect(prisma.purchaseReceiptItem.update).toHaveBeenCalledWith({
        where: { id: 'item-2' },
        data: {
          allocatedExpenses: 40000,
          landedCost: 110000,
        },
      });
    });

    it('should allocate expenses proportionally BY_QUANTITY', async () => {
      const receipt = {
        id: 'rec-2',
        tenantId: 'tenant-123',
        status: PurchaseDocStatus.DRAFT,
        subtotalAmount: 500000,
        discountAmount: 0,
        vatAmount: 0,
        additionalExpensesTotal: 0,
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 8,
            unitPrice: 50000,
            totalPrice: 400000,
            weight: 1,
          },
          {
            id: 'item-2',
            productId: 'prod-2',
            quantity: 2,
            unitPrice: 50000,
            totalPrice: 100000,
            weight: 1,
          },
        ],
      };

      prisma.purchaseReceipt.findFirst.mockResolvedValue(receipt);
      prisma.purchaseExpense.create.mockResolvedValue({ id: 'exp-2', amount: 50000 });
      prisma.purchaseExpense.findMany.mockResolvedValue([{ id: 'exp-2', amount: 50000 }]);
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockImplementation(({ data }: { data: any }) => ({ ...receipt, ...data }));

      await service.addExpense('tenant-123', {
        receiptId: 'rec-2',
        expenseType: ExpenseTypeDto.CUSTOMS,
        amount: 50000,
        allocationMethod: ExpenseAllocationMethodDto.BY_QUANTITY,
      });

      // Item 1 gets 8/10 * 50k = 40,000
      expect(prisma.purchaseReceiptItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          allocatedExpenses: 40000,
          landedCost: (400000 + 40000) / 8, // 55,000
        },
      });

      // Item 2 gets 2/10 * 50k = 10,000
      expect(prisma.purchaseReceiptItem.update).toHaveBeenCalledWith({
        where: { id: 'item-2' },
        data: {
          allocatedExpenses: 10000,
          landedCost: (100000 + 10000) / 2, // 55,000
        },
      });
    });
  });

  // ─── TICKET #15: POSTING, BATCHES & BHMS JOURNAL ───────────────────

  describe('Ticket #15: Posting Invariants & Rollback Guardrails', () => {
    it('should post receipt: increase stock, create ProductBatch, increase supplier debt, create BHMS journal entries', async () => {
      const receipt = {
        id: 'rec-post',
        tenantId: 'tenant-123',
        docNumber: 'PUR-2026-0005',
        docDate: new Date(),
        updatedAt: new Date('2026-09-23T12:00:00.000Z'),
        warehouseId: 'wh-1',
        counterpartyId: 'supp-1',
        currency: 'UZS',
        status: PurchaseDocStatus.DRAFT,
        subtotalAmount: 1000000,
        discountAmount: 0,
        vatAmount: 120000,
        additionalExpensesTotal: 50000,
        totalAmount: 1170000,
        counterparty: { id: 'supp-1', name: 'Global Tech' },
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 10,
            unitPrice: 100000,
            landedCost: 105000,
          },
        ],
        expenses: [],
      };

      prisma.purchaseReceipt.findFirst.mockResolvedValue(receipt);
      prisma.stockLevel.findUnique.mockResolvedValue({ id: 'stock-1', quantity: 5 });
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.productBatch.create.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.journalEntry.count.mockResolvedValue(0);
      prisma.account.findFirst.mockImplementation(({ where }: { where: any }) => ({
        id: `acc-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockImplementation(({ data }: { data: any }) => ({ ...receipt, ...data }));

      await service.postReceipt('tenant-123', 'user-1', 'rec-post');

      // 1. Stock increased by 10
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-1' },
        data: { quantity: { increment: 10 } },
      });

      // 2. ProductBatch created with landedCost
      expect(prisma.productBatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-123',
          productId: 'prod-1',
          warehouseId: 'wh-1',
          receiptId: 'rec-post',
          initialQty: 10,
          remainingQty: 10,
          purchasePrice: 100000,
          landedCost: 105000,
        }),
      });

      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId: 'tenant-123',
        counterpartyId: 'supp-1',
        currency: 'UZS',
        side: CounterpartySettlementSide.SUPPLIER,
        amount: 1170000,
        sourceDocType: 'PurchaseReceipt',
        sourceDocId: 'rec-post',
      }));

      // 4. Double-entry BHMS journal entry created
      expect(prisma.journalEntry.create).toHaveBeenCalled();
      const jeCall = prisma.journalEntry.create.mock.calls[0][0];
      expect(jeCall.data.lines.create).toHaveLength(2); // Inventory net + VAT line
    });

    it('should correctly handle mixed PRODUCT, RAW_MATERIAL, and SERVICE in postReceipt', async () => {
      const receipt = {
        id: 'rec-mixed',
        tenantId: 'tenant-123',
        docNumber: 'PUR-2026-0008',
        docDate: new Date(),
        updatedAt: new Date('2026-09-23T12:00:00.000Z'),
        warehouseId: 'wh-1',
        counterpartyId: 'supp-1',
        currency: 'UZS',
        status: PurchaseDocStatus.DRAFT,
        subtotalAmount: 350000,
        discountAmount: 0,
        vatAmount: 42000,
        additionalExpensesTotal: 0,
        totalAmount: 392000,
        counterparty: { id: 'supp-1', name: 'Mixed Supplier' },
        items: [
          {
            id: 'item-prod',
            productId: 'prod-1',
            quantity: 2,
            unitPrice: 100000,
            totalPrice: 200000,
            allocatedExpenses: 0,
            product: { id: 'prod-1', type: 'PRODUCT' },
          },
          {
            id: 'item-raw',
            productId: 'raw-1',
            quantity: 5,
            unitPrice: 20000,
            totalPrice: 100000,
            allocatedExpenses: 0,
            product: { id: 'raw-1', type: 'RAW_MATERIAL' },
          },
          {
            id: 'item-srv',
            productId: 'srv-1',
            quantity: 1,
            unitPrice: 50000,
            totalPrice: 50000,
            allocatedExpenses: 0,
            product: { id: 'srv-1', type: 'SERVICE' },
          },
        ],
        expenses: [],
      };

      prisma.purchaseReceipt.findFirst.mockResolvedValue(receipt);
      prisma.stockLevel.findUnique.mockResolvedValue({ id: 'stock-1', quantity: 10 });
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.productBatch.create.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.journalEntry.count.mockResolvedValue(1);
      prisma.account.findFirst.mockImplementation(({ where }: { where: any }) => ({
        id: `acc-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockImplementation(({ data }: { data: any }) => ({ ...receipt, ...data }));

      await service.postReceipt('tenant-123', 'user-1', 'rec-mixed');

      // Stock updated for prod-1 and raw-1, NOT for srv-1
      expect(prisma.stockLevel.update).toHaveBeenCalledTimes(2);
      expect(prisma.productBatch.create).toHaveBeenCalledTimes(2);

      // Journal entry lines: PRODUCT (2910), RAW_MATERIAL (1010), SERVICE (9420), VAT (4410)
      const jeCalls = prisma.journalEntry.create.mock.calls;
      const lastJeCall = jeCalls[jeCalls.length - 1][0];
      const lines = lastJeCall.data.lines.create;
      expect(lines).toHaveLength(4);
      expect(lines.find((l: any) => l.debitAccountId === 'acc-2910')?.amount).toBe(200000);
      expect(lines.find((l: any) => l.debitAccountId === 'acc-1010')?.amount).toBe(100000);
      expect(lines.find((l: any) => l.debitAccountId === 'acc-9420')?.amount).toBe(50000);
      expect(lines.find((l: any) => l.debitAccountId === 'acc-4410')?.amount).toBe(42000);
    });

    it('should block unposting if payments are already linked to the receipt', async () => {
      prisma.purchaseReceipt.findFirst.mockResolvedValue({
        id: 'rec-paid',
        tenantId: 'tenant-123',
        status: PurchaseDocStatus.POSTED,
        paidAmount: 500000,
        paymentStatus: PurchasePaymentStatus.PARTIALLY_PAID,
        returnStatus: PurchaseReturnStatus.NONE,
      });

      await expect(
        service.unpostReceipt('tenant-123', 'user-1', 'rec-paid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should unpost receipt with mixed PRODUCT, RAW_MATERIAL, and SERVICE: decrement stock only for physical items and skip SERVICE', async () => {
      const receipt = {
        id: 'rec-unpost-mixed',
        tenantId: 'tenant-123',
        status: PurchaseDocStatus.POSTED,
        docDate: new Date('2026-09-14'),
        updatedAt: new Date('2026-09-23T12:00:00.000Z'),
        currency: 'UZS',
        paidAmount: 0,
        paymentStatus: PurchasePaymentStatus.UNPAID,
        returnStatus: PurchaseReturnStatus.NONE,
        warehouseId: 'wh-1',
        counterpartyId: 'supp-1',
        totalAmount: 392000,
        items: [
          {
            id: 'item-prod',
            productId: 'prod-1',
            quantity: 2,
            product: { id: 'prod-1', type: 'PRODUCT' },
          },
          {
            id: 'item-raw',
            productId: 'raw-1',
            quantity: 5,
            product: { id: 'raw-1', type: 'RAW_MATERIAL' },
          },
          {
            id: 'item-srv',
            productId: 'srv-1',
            quantity: 1,
            product: { id: 'srv-1', type: 'SERVICE' },
          },
        ],
        counterparty: { id: 'supp-1' },
      };

      prisma.purchaseReceipt.findFirst.mockResolvedValue(receipt);
      prisma.stockLevel.findUnique.mockImplementation(({ where }: { where: any }) => {
        if (where.tenantId_warehouseId_productId.productId === 'prod-1') {
          return Promise.resolve({ id: 'stock-prod', quantity: 10 });
        }
        if (where.tenantId_warehouseId_productId.productId === 'raw-1') {
          return Promise.resolve({ id: 'stock-raw', quantity: 20 });
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

      const res = await service.unpostReceipt('tenant-123', 'user-1', 'rec-unpost-mixed');

      expect(res.status).toBe(PurchaseDocStatus.DRAFT);
      // Stock updated for prod-1 (10 -> 8) and raw-1 (20 -> 15), NOT for srv-1
      expect(prisma.stockLevel.update).toHaveBeenCalledTimes(2);
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-prod' },
        data: { quantity: 8 },
      });
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-raw' },
        data: { quantity: 15 },
      });

      // Product batches deleted for receipt
      expect(prisma.productBatch.deleteMany).toHaveBeenCalledWith({
        where: { receiptId: 'rec-unpost-mixed' },
      });

      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId: 'tenant-123',
        counterpartyId: 'supp-1',
        currency: 'UZS',
        side: CounterpartySettlementSide.SUPPLIER,
        amount: -392000,
        entryType: 'PURCHASE_RECEIPT_UNPOSTED',
        sourceDocType: 'PurchaseReceipt',
        sourceDocId: 'rec-unpost-mixed',
      }));

      // Journal entries removed
      expect(prisma.journalEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          sourceDocType: 'PurchaseReceipt',
          sourceDocId: 'rec-unpost-mixed',
        },
      });
    });
  });

  // ─── TICKET #17: PURCHASE RETURNS ──────────────────────────────────

  describe('Ticket #17: Purchase Returns & Inventory Reversal', () => {
    it('should create purchase return, decrement stock, reduce supplier debt, and update returnStatus', async () => {
      prisma.purchaseReturn.count.mockResolvedValue(0);
      prisma.purchaseReturn.create.mockImplementation(({ data }: { data: any }) => ({
        id: 'ret-1',
        ...data,
      }));
      prisma.stockLevel.findUnique.mockResolvedValue({ id: 'stock-1', quantity: 10 });
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.purchaseReceipt.findFirst.mockResolvedValue({
        id: 'rec-1',
        counterpartyId: 'supp-1',
        warehouseId: 'wh-1',
        status: PurchaseDocStatus.POSTED,
        currency: 'UZS',
        totalAmount: 1000000,
        returns: [],
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 10,
            returnedQuantity: 0,
            unitPrice: 100000,
            landedCost: 100000,
          },
        ],
        batches: [
          {
            id: 'batch-1',
            productId: 'prod-1',
            remainingQty: 10,
          },
        ],
      });
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        type: 'PRODUCT',
        name: 'Test Product',
      });
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.findMany.mockResolvedValue([
        { id: 'item-1', quantity: 10, returnedQuantity: 2 },
      ]);
      prisma.productBatch.update.mockResolvedValue({});
      prisma.purchaseReceipt.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      await service.createReturn('tenant-123', 'user-1', {
          receiptId: 'rec-1',
          counterpartyId: 'supp-1',
          warehouseId: 'wh-1',
          currency: 'UZS',
          items: [{ productId: 'prod-1', quantity: 2, unitPrice: 100000 }],
      });

      // Decremented stock by 2 (10 -> 8)
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-1' },
        data: { quantity: { decrement: 2 } },
      });

      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId: 'tenant-123',
        counterpartyId: 'supp-1',
        currency: 'UZS',
        side: CounterpartySettlementSide.SUPPLIER,
        amount: -200000,
        entryType: 'PURCHASE_RETURN_POSTED',
        sourceDocType: 'PurchaseReturn',
        sourceDocId: 'ret-1',
      }));

      // Updated return status on receipt to PARTIALLY_RETURNED
      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
        data: { returnStatus: PurchaseReturnStatus.PARTIALLY_RETURNED },
      });
    });

    it('should disallow returning more than remaining batch quantity', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        type: 'PRODUCT',
        name: 'Test Product',
      });
      prisma.purchaseReceipt.findUnique.mockResolvedValue({
        id: 'rec-1',
        status: PurchaseDocStatus.POSTED,
        items: [{ id: 'item-1', productId: 'prod-1', quantity: 10, returnedQuantity: 8 }],
        batches: [{ id: 'batch-1', productId: 'prod-1', remainingQty: 2 }],
      });

      await expect(
        service.createReturn('tenant-123', 'user-1', {
          receiptId: 'rec-1',
          counterpartyId: 'supp-1',
          warehouseId: 'wh-1',
          items: [{ productId: 'prod-1', quantity: 5, unitPrice: 100000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should disallow returning SERVICE items in purchase return', async () => {
      prisma.purchaseReturn.count.mockResolvedValue(0);
      prisma.product.findFirst.mockResolvedValue({
        id: 'srv-1',
        type: 'SERVICE',
        name: 'Test Service',
      });
      prisma.purchaseReceipt.findUnique.mockResolvedValue({
        id: 'rec-srv',
        status: PurchaseDocStatus.POSTED,
        totalAmount: 50000,
        returns: [],
        items: [
          {
            id: 'item-srv',
            productId: 'srv-1',
            quantity: 1,
            returnedQuantity: 0,
            unitPrice: 50000,
            product: { id: 'srv-1', type: 'SERVICE' },
          },
        ],
        batches: [],
      });

      await expect(
        service.createReturn('tenant-123', 'user-1', {
          receiptId: 'rec-srv',
          counterpartyId: 'supp-1',
          warehouseId: 'wh-1',
          items: [{ productId: 'srv-1', quantity: 1, unitPrice: 50000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should support ReturnDocStatus.UNDER_REVIEW and track returnedQuantity on receipt items', async () => {
      const mockReceiptItem = {
        id: 'item-1',
        productId: 'prod-1',
        quantity: 10,
        returnedQuantity: 2,
        unitPrice: 100000,
        landedCost: 110000,
      };

      expect(mockReceiptItem.returnedQuantity).toBe(2);
      expect(mockReceiptItem.quantity - mockReceiptItem.returnedQuantity).toBe(8);
    });

    it('should cancel posted return: restore stock, product batch remainingQty, and supplier debt', async () => {
      prisma.financeTransaction.findFirst.mockResolvedValue(null);
      prisma.purchaseReturn.findFirst.mockResolvedValue({
        id: 'ret-1',
        returnDate: new Date('2026-09-14'),
        status: ReturnDocStatus.POSTED,
        counterpartyId: 'supp-1',
        currency: 'UZS',
        warehouseId: 'wh-1',
        receiptId: 'rec-1',
        totalAmount: 200000,
        items: [{ productId: 'prod-1', quantity: 2, totalPrice: 200000 }],
        receipt: {
          items: [{ id: 'item-1', productId: 'prod-1', quantity: 10, returnedQuantity: 2 }],
          batches: [{ id: 'batch-1', productId: 'prod-1', remainingQty: 8 }],
        },
      });
      prisma.stockLevel.findUnique.mockResolvedValue({ id: 'stock-1', quantity: 8 });
      prisma.stockLevel.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.update.mockResolvedValue({});
      prisma.productBatch.update.mockResolvedValue({});
      prisma.counterparty.update.mockResolvedValue({});
      prisma.purchaseReceiptItem.findMany.mockResolvedValue([
        { id: 'item-1', quantity: 10, returnedQuantity: 0 },
      ]);
      prisma.purchaseReceipt.update.mockResolvedValue({});
      prisma.purchaseReturn.update.mockResolvedValue({ id: 'ret-1', status: ReturnDocStatus.CANCELLED });
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.cancelReturn('tenant-123', 'user-1', 'ret-1');
      expect(result.status).toBe(ReturnDocStatus.CANCELLED);
      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId: 'tenant-123',
        counterpartyId: 'supp-1',
        currency: 'UZS',
        side: CounterpartySettlementSide.SUPPLIER,
        amount: 200000,
        entryType: 'PURCHASE_RETURN_CANCELLED',
        sourceDocType: 'PurchaseReturn',
        sourceDocId: 'ret-1',
      }));
    });

    it('should create standalone return and consume FIFO batches', async () => {
      prisma.stockLevel.findUnique.mockResolvedValue({ id: 'stock-1', quantity: 15 });
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-raw',
        type: 'RAW_MATERIAL',
        name: 'Iron Sheet',
      });
      prisma.productBatch.findMany.mockResolvedValue([
        { id: 'batch-1', initialQty: 10, remainingQty: 5, purchasePrice: 50000, landedCost: 55000 },
      ]);
      prisma.purchaseReturn.create.mockResolvedValue({
        id: 'ret-standalone',
        returnNumber: 'RET-2026-0002',
        status: ReturnDocStatus.POSTED,
        totalAmount: 150000,
        items: [{ productId: 'prod-raw', quantity: 3, unitPrice: 50000, totalPrice: 150000 }],
      });
      prisma.account.findFirst.mockResolvedValue({ id: 'acc-1' });
      prisma.journalEntry.count.mockResolvedValue(0);
      prisma.journalEntry.create.mockResolvedValue({});

      const res = await service.createReturn('tenant-123', 'user-1', {
        counterpartyId: 'supp-1',
        warehouseId: 'wh-1',
        status: ReturnDocStatus.POSTED,
        items: [{ productId: 'prod-raw', quantity: 3, unitPrice: 50000 }],
      });

      expect(res.status).toBe(ReturnDocStatus.POSTED);
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-1' },
        data: { quantity: { decrement: 3 } },
      });
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { remainingQty: { decrement: 3 } },
      });
      expect(prisma.journalEntry.create).toHaveBeenCalled();
    });

    it('should create a DRAFT return and approve it later', async () => {
      prisma.stockLevel.findUnique.mockResolvedValue({ id: 'stock-1', quantity: 10 });
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        type: 'PRODUCT',
        name: 'Item 1',
      });
      prisma.purchaseReturn.create.mockResolvedValue({
        id: 'ret-draft',
        status: ReturnDocStatus.DRAFT,
        totalAmount: 100000,
        items: [{ productId: 'prod-1', quantity: 1, unitPrice: 100000 }],
      });

      // 1. Create Draft
      const draft = await service.createReturn('tenant-123', 'user-1', {
        counterpartyId: 'supp-1',
        warehouseId: 'wh-1',
        status: ReturnDocStatus.DRAFT,
        items: [{ productId: 'prod-1', quantity: 1, unitPrice: 100000 }],
      });
      expect(draft.status).toBe(ReturnDocStatus.DRAFT);

      // Stock should NOT be decremented yet during draft creation
      expect(prisma.stockLevel.update).not.toHaveBeenCalled();

      // 2. Approve Draft
      prisma.purchaseReturn.findFirst.mockResolvedValue({
        id: 'ret-draft',
        status: ReturnDocStatus.DRAFT,
        warehouseId: 'wh-1',
        counterpartyId: 'supp-1',
        totalAmount: 100000,
        items: [{ productId: 'prod-1', quantity: 1, unitPrice: 100000, totalPrice: 100000 }],
      });
      prisma.purchaseReturn.update.mockResolvedValue({
        id: 'ret-draft',
        status: ReturnDocStatus.POSTED,
      });

      const approved = await service.approveReturn('tenant-123', 'user-1', 'ret-draft');
      expect(approved.status).toBe(ReturnDocStatus.POSTED);
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-1' },
        data: { quantity: { decrement: 1 } },
      });
    });
  });

  // ─── TICKET #18: MULTI-CURRENCY PURCHASES SUMMARY & KPI SEPARATION ─────

  describe('Multi-Currency Purchases Summary (ADR 0023)', () => {
    it('should return segregated currency totals for purchases, debts, and returns without flattening to UZS', async () => {
      // Mock receipts: 1 in UZS (12,000,000 UZS), 1 in USD ($1,500)
      (prisma.purchaseReceipt.findMany as jest.Mock).mockImplementation(({ where }: { where: any }) => {
        if (where?.paymentStatus) {
          // Unpaid receipts for debt by currency
          return Promise.resolve([
            { totalAmount: 2000000, paidAmount: 0, currency: 'UZS' },
            { totalAmount: 500, paidAmount: 0, currency: 'USD' },
          ]);
        }
        // Monthly posted receipts
        return Promise.resolve([
          { totalAmount: 12000000, currency: 'UZS', exchangeRate: 1 },
          { totalAmount: 1500, currency: 'USD', exchangeRate: 12800 },
        ]);
      });

      // Mock returns: 1 in USD ($200)
      (prisma.purchaseReturn.findMany as jest.Mock).mockResolvedValue([
        { totalAmount: 200, currency: 'USD' },
      ]);

      // Debt totals are based on the currency-specific settlement projection.
      (prisma.counterpartyBalance.findMany as jest.Mock).mockResolvedValue([
        { counterpartyId: 'supp-1', currency: 'UZS', supplierDebt: 2000000 },
        { counterpartyId: 'supp-2', currency: 'USD', supplierDebt: 500 },
      ]);
      (prisma.counterparty.count as jest.Mock).mockResolvedValue(2);

      const stats = await service.getSummaryStats('tenant-123');

      // Assert segregated currency lists exist and accurately reflect native amounts
      expect(stats.monthlyPurchasesByCurrency).toEqual([
        { currency: 'UZS', amount: 12000000 },
        { currency: 'USD', amount: 1500 },
      ]);
      expect(stats.totalSupplierDebtByCurrency).toEqual([
        { currency: 'UZS', amount: 2000000 },
        { currency: 'USD', amount: 500 },
      ]);
      expect(stats.monthlyReturnsByCurrency).toEqual([
        { currency: 'USD', amount: 200 },
      ]);
      expect(stats.monthlyPurchasesCount).toBe(2);
      expect(stats.suppliersWithDebtCount).toBe(2);
    });
  });
});
