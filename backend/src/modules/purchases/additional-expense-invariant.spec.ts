import { Test, TestingModule } from '@nestjs/testing';
import { AdditionalExpensesService } from './additional-expenses.service';
import { PrismaService } from '../../common/prisma';
import { BadRequestException } from '@nestjs/common';
import {
  ExpenseType,
  ExpenseAllocationMethod,
  PurchaseDocStatus,
} from '@prisma/client';

describe('Additional Expenses & Landed Cost Invariant Tests', () => {
  let service: AdditionalExpensesService;
  let prisma: any;

  const tenantId = 'tenant-invariant-1';
  const userId = 'user-admin-1';
  const receiptId = 'receipt-inbound-1';

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
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      productBatch: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
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

  // ─── INVARIANT 1: UNSOLD GOODS LANDED COST ALLOCATION & CATALOG SYNC ────────
  it('Invariant 1: Unsold goods absorb full unit landed cost into batch and sync to catalog', async () => {
    const mockExpense = {
      id: 'exp-inv-1',
      tenantId,
      docNumber: 'EXP-2026-0001',
      docDate: new Date(),
      status: PurchaseDocStatus.DRAFT,
      amount: 2000000,
      receiptId,
      isPaid: false,
      counterpartyId: 'carrier-1',
      counterparty: { id: 'carrier-1', name: 'Silk Road Logistics' },
      items: [
        {
          id: 'ei-1',
          productId: 'prod-iphone',
          initialLandedCost: 1000000,
          allocatedAmount: 2000000,
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

    const posted = await service.postExpense(tenantId, userId, 'exp-inv-1');

    expect(posted.status).toBe(PurchaseDocStatus.POSTED);
    // 2,000,000 / 10 = 200,000 -> 1,000,000 + 200,000 = 1,200,000
    expect(prisma.productBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { landedCost: 1200000 },
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-iphone' },
      data: { costPrice: 1200000 },
    });
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lines: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                debitAccountId: 'acc-2910',
                amount: 2000000,
              }),
            ]),
          }),
        }),
      }),
    );
  });

  // ─── INVARIANT 2: PARTIALLY SOLD GOODS RETROACTIVE COGS RECALIBRATION ───────
  it('Invariant 2: Partially sold goods split expense proportionally between warehouse batch and sales COGS', async () => {
    // 10 items total: 6 sold, 4 in warehouse -> 60% to COGS, 40% to batch
    const mockExpense = {
      id: 'exp-inv-2',
      tenantId,
      docNumber: 'EXP-2026-0002',
      docDate: new Date(),
      status: PurchaseDocStatus.DRAFT,
      amount: 2000000,
      receiptId,
      isPaid: false,
      counterpartyId: 'carrier-1',
      counterparty: { id: 'carrier-1', name: 'Silk Road Logistics' },
      items: [
        {
          id: 'ei-2',
          productId: 'prod-iphone',
          initialLandedCost: 1000000,
          allocatedAmount: 2000000,
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
      { id: 'inv-item-1', lineCogs: 7200000 },
    ]);
    prisma.salesInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      totalAmount: 9000000,
    });
    prisma.additionalExpense.update.mockResolvedValue({
      ...mockExpense,
      status: PurchaseDocStatus.POSTED,
    });

    await service.postExpense(tenantId, userId, 'exp-inv-2');

    // Unit expense = 200,000 per unit
    // Batch landed cost = 1,000,000 + 200,000 = 1,200,000
    expect(prisma.productBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { landedCost: 1200000 },
    });

    // 6 sold units * 200,000 = +1,200,000 COGS delta
    // New lineCogs = 6,000,000 + 1,200,000 = 7,200,000
    // New grossProfit = 9,000,000 - 7,200,000 = 1,800,000
    expect(prisma.salesInvoiceItem.update).toHaveBeenCalledWith({
      where: { id: 'inv-item-1' },
      data: {
        unitCogs: 1200000,
        lineCogs: 7200000,
        lineGrossProfit: 1800000,
      },
    });

    // Journal Entry has both Debits 2910 (800,000) and 9110 (1,200,000)
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lines: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                debitAccountId: 'acc-2910',
                amount: 800000,
              }),
              expect.objectContaining({
                debitAccountId: 'acc-9110',
                amount: 1200000,
              }),
            ]),
          }),
        }),
      }),
    );
  });

  // ─── INVARIANT 3: ALLOCATION REMAINDER RULE & ZERO FRACTIONAL DRIFT ─────────
  it('Invariant 3: Allocation Remainder Rule guarantees exact sum matching without tiyin drift', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue({
      id: receiptId,
      items: [
        { id: 'i-1', productId: 'p-1', quantity: 1, totalPrice: 50000, landedCost: 50000, product: { weight: 1 } },
        { id: 'i-2', productId: 'p-2', quantity: 1, totalPrice: 30000, landedCost: 30000, product: { weight: 1 } },
        { id: 'i-3', productId: 'p-3', quantity: 1, totalPrice: 20000, landedCost: 20000, product: { weight: 1 } },
      ],
      batches: [],
    });

    const preview = await service.calculateAllocationPreview(tenantId, {
      receiptId,
      amount: 100000, // 100,000 UZS split across 50k, 30k, 20k -> 50%, 30%, 20%
      allocationMethod: ExpenseAllocationMethod.BY_AMOUNT,
    });

    expect(preview.allocatedTotal).toBe(100000);
    const sum = preview.items.reduce((s, it) => s + it.allocatedAmount, 0);
    expect(sum).toBe(100000);
  });

  // ─── INVARIANT 4: ROLLBACK GUARDRAIL AGAINST ACTIVE CASH PAYMENTS ───────────
  it('Invariant 4: Rollback guardrail blocks unposting/cancelling when active cash payments exist', async () => {
    prisma.additionalExpense.findFirst.mockResolvedValue({
      id: 'exp-inv-4',
      status: PurchaseDocStatus.POSTED,
      amount: 500000,
      items: [],
    });
    prisma.financeTransaction.findFirst.mockResolvedValue({
      id: 'ft-linked-1',
      sourceDocId: 'exp-inv-4',
      isDeleted: false,
    });

    await expect(
      service.cancelExpense(tenantId, userId, 'exp-inv-4'),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── INVARIANT 5: SAFE CANCELLATION RESTORES BATCH COSTS & COGS ─────────────
  it('Invariant 5: Cancellation cleanly reverts batch landed cost and retroactive COGS adjustments', async () => {
    prisma.additionalExpense.findFirst.mockResolvedValue({
      id: 'exp-inv-5',
      status: PurchaseDocStatus.POSTED,
      amount: 2000000,
      receiptId,
      isPaid: false,
      counterpartyId: 'carrier-1',
      items: [
        {
          id: 'ei-5',
          productId: 'prod-iphone',
          allocatedAmount: 2000000,
          soldQuantity: 6,
          remainingQuantity: 4,
        },
      ],
    });
    prisma.financeTransaction.findFirst.mockResolvedValue(null);
    prisma.productBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      purchasePrice: 1000000,
      landedCost: 1200000,
      consumptions: [
        {
          id: 'cons-1',
          quantity: 6,
          salesInvoiceItemId: 'inv-item-1',
          salesInvoiceItem: {
            id: 'inv-item-1',
            invoiceId: 'inv-1',
            totalPrice: 9000000,
            unitCogs: 1200000,
            lineCogs: 7200000,
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
      id: 'exp-inv-5',
      status: PurchaseDocStatus.CANCELLED,
    });

    const cancelled = await service.cancelExpense(tenantId, userId, 'exp-inv-5');

    expect(cancelled.status).toBe(PurchaseDocStatus.CANCELLED);
    expect(prisma.productBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { landedCost: 1000000 }, // Restored to initial cost
    });
    expect(prisma.salesInvoiceItem.update).toHaveBeenCalledWith({
      where: { id: 'inv-item-1' },
      data: {
        unitCogs: 1000000,
        lineCogs: 6000000,
        lineGrossProfit: 3000000,
      },
    });
    expect(prisma.journalEntry.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        sourceDocType: 'AdditionalExpense',
        sourceDocId: 'exp-inv-5',
      },
    });
  });
});
