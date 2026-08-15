import { Test, TestingModule } from '@nestjs/testing';
import { AdditionalExpensesService } from './additional-expenses.service';
import { PrismaService } from '../../common/prisma';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ExpenseType,
  ExpenseAllocationMethod,
  PurchaseDocStatus,
} from '@prisma/client';

describe('AdditionalExpensesService Unit Tests', () => {
  let service: AdditionalExpensesService;
  let prisma: any;

  const tenantId = 'tenant-123';
  const userId = 'user-123';
  const receiptId = 'receipt-123';

  const mockReceipt = {
    id: receiptId,
    tenantId,
    docNumber: 'PUR-2026-0001',
    status: PurchaseDocStatus.POSTED,
    items: [
      {
        id: 'item-1',
        productId: 'prod-iphone',
        quantity: 10,
        unitPrice: 1000000,
        totalPrice: 10000000,
        weight: 0.2,
        landedCost: 1000000,
        product: { id: 'prod-iphone', name: { uz: 'iPhone' }, sku: 'IPH-13', weight: 0.2, unitOfMeasure: 'piece' },
      },
      {
        id: 'item-2',
        productId: 'prod-cable',
        quantity: 20,
        unitPrice: 50000,
        totalPrice: 1000000,
        weight: 0.05,
        landedCost: 50000,
        product: { id: 'prod-cable', name: { uz: 'Kabel' }, sku: 'CAB-01', weight: 0.05, unitOfMeasure: 'piece' },
      },
      {
        id: 'item-3',
        productId: 'prod-charger',
        quantity: 10,
        unitPrice: 20000,
        totalPrice: 200000,
        weight: 0.1,
        landedCost: 20000,
        product: { id: 'prod-charger', name: { uz: 'Zaryadlovchi' }, sku: 'CHG-01', weight: 0.1, unitOfMeasure: 'piece' },
      },
    ],
    batches: [
      {
        id: 'batch-1',
        productId: 'prod-iphone',
        remainingQty: 10,
        initialQty: 10,
        purchasePrice: 1000000,
        landedCost: 1000000,
        consumptions: [],
      },
      {
        id: 'batch-2',
        productId: 'prod-cable',
        remainingQty: 20,
        initialQty: 20,
        purchasePrice: 50000,
        landedCost: 50000,
        consumptions: [],
      },
      {
        id: 'batch-3',
        productId: 'prod-charger',
        remainingQty: 10,
        initialQty: 10,
        purchasePrice: 20000,
        landedCost: 20000,
        consumptions: [],
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      additionalExpense: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      additionalExpenseItem: {
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      purchaseReceipt: {
        findFirst: jest.fn().mockResolvedValue(mockReceipt),
        update: jest.fn(),
      },
      productBatch: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      product: {
        update: jest.fn(),
      },
      salesInvoiceItem: {
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      salesInvoice: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      cashAccount: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      counterparty: {
        update: jest.fn(),
      },
      financeTransaction: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      account: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.code === '2910') return Promise.resolve({ id: 'acc-2910', code: '2910' });
          if (where.code === '9110') return Promise.resolve({ id: 'acc-9110', code: '9110' });
          if (where.code === '4410') return Promise.resolve({ id: 'acc-4410', code: '4410' });
          if (where.code === '6010') return Promise.resolve({ id: 'acc-6010', code: '6010' });
          if (where.code === '5010') return Promise.resolve({ id: 'acc-5010', code: '5010' });
          return Promise.resolve(null);
        }),
      },
      journalEntry: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdditionalExpensesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AdditionalExpensesService>(AdditionalExpensesService);
  });

  describe('calculateAllocationPreview', () => {
    it('allocates by value (BY_AMOUNT) and strictly matches total with remainder rule', async () => {
      const result = await service.calculateAllocationPreview(tenantId, {
        receiptId,
        amount: 2000000,
        allocationMethod: ExpenseAllocationMethod.BY_AMOUNT,
      });

      expect(result.expenseAmount).toBe(2000000);
      expect(result.allocatedTotal).toBe(2000000);
      expect(result.items.length).toBe(3);

      // iPhone line: 10,000,000 / 11,200,000 * 2,000,000 = 1,785,714.2857 -> rounded with remainder
      const iphone = result.items.find((i) => i.productId === 'prod-iphone');
      const cable = result.items.find((i) => i.productId === 'prod-cable');
      const charger = result.items.find((i) => i.productId === 'prod-charger');

      expect(iphone).toBeDefined();
      expect(cable).toBeDefined();
      expect(charger).toBeDefined();

      const sum = iphone!.allocatedAmount + cable!.allocatedAmount + charger!.allocatedAmount;
      expect(sum).toBe(2000000);
      expect(iphone!.newLandedCost).toBeGreaterThan(1000000);
    });

    it('allocates by quantity (BY_QUANTITY)', async () => {
      const result = await service.calculateAllocationPreview(tenantId, {
        receiptId,
        amount: 400000,
        allocationMethod: ExpenseAllocationMethod.BY_QUANTITY,
      });

      // Total quantity: 10 + 20 + 10 = 40 items -> 10,000 UZS per item
      expect(result.allocatedTotal).toBe(400000);
      const iphone = result.items.find((i) => i.productId === 'prod-iphone');
      const cable = result.items.find((i) => i.productId === 'prod-cable');

      expect(iphone!.allocatedAmount).toBe(100000); // 10 * 10,000
      expect(cable!.allocatedAmount).toBe(200000); // 20 * 10,000
    });

    it('filters selected items when selectedItemIds provided', async () => {
      const result = await service.calculateAllocationPreview(tenantId, {
        receiptId,
        amount: 500000,
        selectedItemIds: ['item-1'], // Only iPhone
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].productId).toBe('prod-iphone');
      expect(result.allocatedTotal).toBe(500000);
    });
  });

  describe('createDraft & updateDraft', () => {
    it('creates an expense in DRAFT status with generated EXP number', async () => {
      prisma.additionalExpense.create.mockResolvedValue({
        id: 'exp-1',
        docNumber: 'EXP-2026-0001',
        status: PurchaseDocStatus.DRAFT,
        amount: 2000000,
      });

      const res = await service.createDraft(tenantId, userId, {
        receiptId,
        counterpartyId: 'carrier-1',
        expenseType: ExpenseType.TRANSPORT,
        amount: 2000000,
      });

      expect(prisma.additionalExpense.create).toHaveBeenCalled();
      expect(res.docNumber).toBe('EXP-2026-0001');
      expect(res.status).toBe(PurchaseDocStatus.DRAFT);
    });

    it('rejects update if expense is not in DRAFT status', async () => {
      prisma.additionalExpense.findFirst.mockResolvedValue({
        id: 'exp-1',
        status: PurchaseDocStatus.POSTED,
      });

      await expect(
        service.updateDraft(tenantId, userId, 'exp-1', { amount: 3000000 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('postExpense & Retroactive COGS Recalibration', () => {
    it('posts expense on unsold inventory, updating ProductBatch and Product.costPrice', async () => {
      const mockExpense = {
        id: 'exp-1',
        tenantId,
        docNumber: 'EXP-2026-0001',
        docDate: new Date(),
        status: PurchaseDocStatus.DRAFT,
        amount: 1000000,
        receiptId,
        isPaid: false,
        counterpartyId: 'carrier-1',
        counterparty: { id: 'carrier-1', name: 'Silk Road Logistics' },
        items: [
          {
            id: 'ei-1',
            productId: 'prod-iphone',
            initialLandedCost: 1000000,
            allocatedAmount: 1000000,
            soldQuantity: 0,
            remainingQuantity: 10,
          },
        ],
      };

      prisma.additionalExpense.findFirst.mockResolvedValue(mockExpense);
      prisma.productBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        productId: 'prod-iphone',
        purchasePrice: 1000000,
        landedCost: 1000000,
        remainingQty: 10,
        consumptions: [],
      });
      prisma.additionalExpense.update.mockResolvedValue({
        ...mockExpense,
        status: PurchaseDocStatus.POSTED,
      });

      const res = await service.postExpense(tenantId, userId, 'exp-1');

      expect(res.status).toBe(PurchaseDocStatus.POSTED);
      // Unit expense: 1,000,000 / 10 = 100,000 -> New landed cost: 1,100,000
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { landedCost: 1100000 },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-iphone' },
        data: { costPrice: 1100000 },
      });
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'carrier-1' },
        data: { debtBalance: { increment: 1000000 } },
      });
      expect(prisma.journalEntry.create).toHaveBeenCalled();
    });

    it('retroactively recalculates historical SalesInvoice COGS when items were partially sold', async () => {
      const mockExpense = {
        id: 'exp-1',
        tenantId,
        docNumber: 'EXP-2026-0001',
        docDate: new Date(),
        status: PurchaseDocStatus.DRAFT,
        amount: 1000000,
        receiptId,
        isPaid: false,
        counterpartyId: 'carrier-1',
        counterparty: { id: 'carrier-1', name: 'Silk Road Logistics' },
        items: [
          {
            id: 'ei-1',
            productId: 'prod-iphone',
            initialLandedCost: 1000000,
            allocatedAmount: 1000000,
            soldQuantity: 6,
            remainingQuantity: 4,
          },
        ],
      };

      prisma.additionalExpense.findFirst.mockResolvedValue(mockExpense);
      prisma.productBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        productId: 'prod-iphone',
        purchasePrice: 1000000,
        landedCost: 1000000,
        remainingQty: 4,
        consumptions: [
          {
            id: 'cons-1',
            quantity: 6,
            unitCost: 1000000,
            salesInvoiceItemId: 'inv-item-1',
            salesInvoiceItem: {
              id: 'inv-item-1',
              invoiceId: 'inv-1',
              productId: 'prod-iphone',
              quantity: 6,
              unitPrice: 1500000,
              totalPrice: 9000000,
              unitCogs: 1000000,
              lineCogs: 6000000,
              lineGrossProfit: 3000000,
            },
          },
        ],
      });
      prisma.salesInvoiceItem.findMany.mockResolvedValue([
        {
          id: 'inv-item-1',
          lineCogs: 6600000,
        },
      ]);
      prisma.salesInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        totalAmount: 9000000,
      });
      prisma.additionalExpense.update.mockResolvedValue({
        ...mockExpense,
        status: PurchaseDocStatus.POSTED,
      });

      await service.postExpense(tenantId, userId, 'exp-1');

      // Unit expense = 100,000 per piece
      // Sold 6 pieces -> 6 * 100,000 = 600,000 added to COGS
      // New lineCogs = 6,000,000 + 600,000 = 6,600,000
      // New lineGrossProfit = 9,000,000 - 6,600,000 = 2,400,000
      expect(prisma.salesInvoiceItem.update).toHaveBeenCalledWith({
        where: { id: 'inv-item-1' },
        data: {
          unitCogs: 1100000,
          lineCogs: 6600000,
          lineGrossProfit: 2400000,
        },
      });

      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: {
          totalCogs: 6600000,
          grossProfit: 2400000,
        },
      });
    });
  });

  describe('cancelExpense & Rollback Guardrail', () => {
    it('blocks cancellation if active linked cash payment exists', async () => {
      prisma.additionalExpense.findFirst.mockResolvedValue({
        id: 'exp-1',
        status: PurchaseDocStatus.POSTED,
        amount: 500000,
        items: [],
      });
      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'ft-1',
        sourceDocId: 'exp-1',
        isDeleted: false,
      });

      await expect(
        service.cancelExpense(tenantId, userId, 'exp-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('cleanly cancels and restores batch and sales COGS when no active cash payment', async () => {
      prisma.additionalExpense.findFirst.mockResolvedValue({
        id: 'exp-1',
        status: PurchaseDocStatus.POSTED,
        amount: 1000000,
        receiptId,
        isPaid: false,
        counterpartyId: 'carrier-1',
        items: [
          {
            id: 'ei-1',
            productId: 'prod-iphone',
            allocatedAmount: 1000000,
            soldQuantity: 6,
            remainingQuantity: 4,
          },
        ],
      });
      prisma.financeTransaction.findFirst.mockResolvedValue(null);
      prisma.productBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        purchasePrice: 1000000,
        landedCost: 1100000,
        consumptions: [
          {
            id: 'cons-1',
            quantity: 6,
            salesInvoiceItemId: 'inv-item-1',
            salesInvoiceItem: {
              id: 'inv-item-1',
              invoiceId: 'inv-1',
              totalPrice: 9000000,
              unitCogs: 1100000,
              lineCogs: 6600000,
            },
          },
        ],
      });
      prisma.salesInvoiceItem.findMany.mockResolvedValue([
        { id: 'inv-item-1', lineCogs: 6000000 },
      ]);
      prisma.salesInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        totalAmount: 9000000,
      });
      prisma.additionalExpense.update.mockResolvedValue({
        id: 'exp-1',
        status: PurchaseDocStatus.CANCELLED,
      });

      const res = await service.cancelExpense(tenantId, userId, 'exp-1');

      expect(res.status).toBe(PurchaseDocStatus.CANCELLED);
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { landedCost: 1000000 }, // Restored to initial
      });
      expect(prisma.salesInvoiceItem.update).toHaveBeenCalledWith({
        where: { id: 'inv-item-1' },
        data: {
          unitCogs: 1000000, // Restored to 1,000,000
          lineCogs: 6000000,
          lineGrossProfit: 3000000,
        },
      });
    });
  });
});
