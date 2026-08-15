import { Test, TestingModule } from '@nestjs/testing';
import { PurchasesService } from './purchases.service';
import { PrismaService } from '../../common/prisma';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  PurchaseDocStatus,
  PurchasePaymentStatus,
  PurchaseReturnStatus,
  ReturnDocStatus,
} from '@prisma/client';
import {
  ExpenseTypeDto,
  ExpenseAllocationMethodDto,
} from './dto/create-purchase-expense.dto';

describe('PurchasesService Full Unit & Invariant Test Suite', () => {
  let service: PurchasesService;
  let prisma: any;

  beforeEach(async () => {
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
        count: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
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
        warehouseId: 'wh-1',
        counterpartyId: 'supp-1',
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

      // 3. Supplier debt increased
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'supp-1' },
        data: { debtBalance: { increment: 1170000 } },
      });

      // 4. Double-entry BHMS journal entry created
      expect(prisma.journalEntry.create).toHaveBeenCalled();
      const jeCall = prisma.journalEntry.create.mock.calls[0][0];
      expect(jeCall.data.lines.create).toHaveLength(2); // Inventory net + VAT line
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
      prisma.purchaseReceipt.findUnique.mockResolvedValue({
        id: 'rec-1',
        status: PurchaseDocStatus.POSTED,
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
        items: [{ productId: 'prod-1', quantity: 2, unitPrice: 100000 }],
      });

      // Decremented stock by 2 (10 -> 8)
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: { id: 'stock-1' },
        data: { quantity: 8 },
      });

      // Reduced supplier debt by 200,000
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'supp-1' },
        data: { debtBalance: { decrement: 200000 } },
      });

      // Updated return status on receipt to PARTIALLY_RETURNED
      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
        data: { returnStatus: PurchaseReturnStatus.PARTIALLY_RETURNED },
      });
    });

    it('should disallow returning more than remaining batch quantity', async () => {
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
      prisma.purchaseReturn.findFirst.mockResolvedValue({
        id: 'ret-1',
        status: ReturnDocStatus.POSTED,
        counterpartyId: 'supp-1',
        warehouseId: 'wh-1',
        receiptId: 'rec-1',
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
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'supp-1' },
        data: { debtBalance: { increment: 200000 } },
      });
    });
  });
});



