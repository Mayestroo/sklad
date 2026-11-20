import { Test, TestingModule } from '@nestjs/testing';
import {
  AdditionalExpensesService,
  allocationRows,
} from './additional-expenses.service';
import { convertAndAllocate } from './expense-allocation.engine';
import { PrismaService } from '../../common/prisma';
import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  ExpenseType,
  ExpenseAllocationMethod,
  PurchaseDocStatus,
  CounterpartySettlementSide,
} from '@prisma/client';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { AccountsService } from '../accounting/accounts/accounts.service';
import { JournalService } from '../accounting/journal/journal.service';

jest.mock('../../common/sequences/document-sequence');
jest.mock('../../common/prisma/assert-tenant-owned');
jest.mock('../../common/accounting-period/period-lock');

describe('AdditionalExpensesService Unit Tests', () => {
  let service: AdditionalExpensesService;
  let prisma: any;
  let settlementService: { recordMovement: jest.Mock };

  const tenantId = 'tenant-123';
  const userId = 'user-123';
  const receiptId = 'receipt-123';

  const mockReceipt = {
    id: receiptId,
    tenantId,
    docNumber: 'PUR-2026-0001',
    status: PurchaseDocStatus.POSTED,
    currency: 'UZS',
    exchangeRate: 1,
    items: [
      {
        id: 'item-1',
        productId: 'prod-iphone',
        quantity: 10,
        unitPrice: 1000000,
        totalPrice: 10000000,
        weight: 0.2,
        landedCost: 1000000,
        product: {
          id: 'prod-iphone',
          name: { uz: 'iPhone' },
          sku: 'IPH-13',
          weight: 0.2,
          unitOfMeasure: 'piece',
        },
      },
      {
        id: 'item-2',
        productId: 'prod-cable',
        quantity: 20,
        unitPrice: 50000,
        totalPrice: 1000000,
        weight: 0.05,
        landedCost: 50000,
        product: {
          id: 'prod-cable',
          name: { uz: 'Kabel' },
          sku: 'CAB-01',
          weight: 0.05,
          unitOfMeasure: 'piece',
        },
      },
      {
        id: 'item-3',
        productId: 'prod-charger',
        quantity: 10,
        unitPrice: 20000,
        totalPrice: 200000,
        weight: 0.1,
        landedCost: 20000,
        product: {
          id: 'prod-charger',
          name: { uz: 'Zaryadlovchi' },
          sku: 'CHG-01',
          weight: 0.1,
          unitOfMeasure: 'piece',
        },
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

  /** Matches a Decimal (or number) equal to `n`: posting writes exact Decimals. */
  const dec = (n: number) => ({
    asymmetricMatch: (v: unknown) =>
      v != null && new Prisma.Decimal(v as number).eq(n),
    toString: () => `Decimal(${n})`,
  });

  /**
   * The lines createDraft stores for this expense: the real
   * convertAndAllocate() output, so posting finds its snapshot unchanged.
   */
  const draftLines = (
    expense: {
      amount: number;
      currency: string;
      exchangeRate?: number;
      docDate: Date;
    },
    selectedItemIds: string[],
    receipt: { currency: string; exchangeRate: number } = mockReceipt,
  ) =>
    allocationRows(
      convertAndAllocate({
        items: mockReceipt.items.filter((i) => selectedItemIds.includes(i.id)),
        amount: expense.amount,
        allocationMethod: ExpenseAllocationMethod.BY_AMOUNT,
        expense: {
          currency: expense.currency,
          exchangeRate: expense.exchangeRate,
        },
        receipt,
        rateDate: expense.docDate,
        batches: mockReceipt.batches,
      }),
    ).map((row, i) => ({ id: `ei-${i + 1}`, ...row }));

  beforeEach(async () => {
    settlementService = {
      recordMovement: jest.fn().mockResolvedValue({ created: true }),
    };
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
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      purchaseReceipt: {
        findFirst: jest.fn().mockResolvedValue(mockReceipt),
        update: jest.fn(),
      },
      purchaseReceiptItem: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'receipt-item-1', landedCost: 1000000 }),
        update: jest.fn(),
      },
      productBatch: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      batchConsumption: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      product: {
        // A UZS card unless a test says otherwise.
        findFirst: jest.fn().mockResolvedValue({
          costPriceCurrency: 'UZS',
          costPriceExchangeRate: 1,
        }),
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
        // Payments re-check the post-decrement balance they get back.
        update: jest.fn().mockResolvedValue({ balance: 0 }),
      },
      counterparty: {
        update: jest.fn(),
      },
      settlementAllocation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      financeTransaction: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      account: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.code === '2910')
            return Promise.resolve({ id: 'acc-2910', code: '2910' });
          if (where.code === '9110')
            return Promise.resolve({ id: 'acc-9110', code: '9110' });
          if (where.code === '4410')
            return Promise.resolve({ id: 'acc-4410', code: '4410' });
          if (where.code === '6010')
            return Promise.resolve({ id: 'acc-6010', code: '6010' });
          if (where.code === '5010')
            return Promise.resolve({ id: 'acc-5010', code: '5010' });
          if (where.code === '5210')
            return Promise.resolve({ id: 'acc-5210', code: '5210' });
          return Promise.resolve(null);
        }),
      },
      journalEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        create: jest.fn(),
      },
      // lockDocumentStatus: the posted draft is still a draft.
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'DRAFT' }]),
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalService,
        AdditionalExpensesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CounterpartySettlementService, useValue: settlementService },
        {
          provide: AccountsService,
          useValue: { ensureDefaultAccounts: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AdditionalExpensesService>(AdditionalExpensesService);
  });

  describe('calculateAllocationPreview', () => {
    it('allocates by value (BY_AMOUNT) and strictly matches total with remainder rule', async () => {
      const result = await service.calculateAllocationPreview(tenantId, {
        receiptId,
        amount: 2000000,
        currency: 'UZS',
        allocationMethod: ExpenseAllocationMethod.BY_AMOUNT,
      });

      expect(result.expenseAmount).toBe(2000000);
      expect(result.receiptTotal).toBe(2000000);
      expect(result.baseTotal).toBe(2000000);
      expect(result.items.length).toBe(3);

      // iPhone line: 10,000,000 / 11,200,000 * 2,000,000 = 1,785,714.2857 -> rounded with remainder
      const iphone = result.items.find((i) => i.productId === 'prod-iphone');
      const cable = result.items.find((i) => i.productId === 'prod-cable');
      const charger = result.items.find((i) => i.productId === 'prod-charger');

      expect(iphone).toBeDefined();
      expect(cable).toBeDefined();
      expect(charger).toBeDefined();

      const sum =
        iphone!.allocatedAmount +
        cable!.allocatedAmount +
        charger!.allocatedAmount;
      expect(sum).toBe(2000000);
      expect(iphone!.newLandedCost).toBeGreaterThan(1000000);
    });

    it('allocates by quantity (BY_QUANTITY)', async () => {
      const result = await service.calculateAllocationPreview(tenantId, {
        receiptId,
        amount: 400000,
        currency: 'UZS',
        allocationMethod: ExpenseAllocationMethod.BY_QUANTITY,
      });

      // Total quantity: 10 + 20 + 10 = 40 items -> 10,000 UZS per item
      expect(result.expenseAmount).toBe(400000);
      const iphone = result.items.find((i) => i.productId === 'prod-iphone');
      const cable = result.items.find((i) => i.productId === 'prod-cable');

      expect(iphone!.allocatedAmount).toBe(100000); // 10 * 10,000
      expect(cable!.allocatedAmount).toBe(200000); // 20 * 10,000
    });

    it('filters selected items when selectedItemIds provided', async () => {
      const result = await service.calculateAllocationPreview(tenantId, {
        receiptId,
        amount: 500000,
        currency: 'UZS',
        selectedItemIds: ['item-1'], // Only iPhone
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].productId).toBe('prod-iphone');
      expect(result.items[0].allocatedAmount).toBe(500000);
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
        currency: 'UZS',
        amount: 2000000,
      });

      expect(prisma.additionalExpense.create).toHaveBeenCalled();
      expect(res.docNumber).toBe('EXP-2026-0001');
      expect(res.status).toBe(PurchaseDocStatus.DRAFT);
    });

    it('rejects createDraft if currency is missing or unsupported', async () => {
      await expect(
        service.createDraft(tenantId, userId, {
          receiptId,
          counterpartyId: 'carrier-1',
          expenseType: ExpenseType.TRANSPORT,
          currency: '' as any,
          amount: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects createDraft if currency is USD and exchangeRate is missing, 0, or negative', async () => {
      await expect(
        service.createDraft(tenantId, userId, {
          receiptId,
          counterpartyId: 'carrier-1',
          expenseType: ExpenseType.TRANSPORT,
          currency: 'USD',
          amount: 1000,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createDraft(tenantId, userId, {
          receiptId,
          counterpartyId: 'carrier-1',
          expenseType: ExpenseType.TRANSPORT,
          currency: 'USD',
          exchangeRate: 0,
          amount: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects createDraft if amount is zero or negative', async () => {
      await expect(
        service.createDraft(tenantId, userId, {
          receiptId,
          counterpartyId: 'carrier-1',
          expenseType: ExpenseType.TRANSPORT,
          currency: 'UZS',
          amount: 0,
        }),
      ).rejects.toThrow(BadRequestException);
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
    it('rejects a paid expense that has no cash or bank account attached', async () => {
      prisma.additionalExpense.findFirst.mockResolvedValue({
        id: 'exp-missing-account',
        tenantId,
        status: PurchaseDocStatus.DRAFT,
        isPaid: true,
        cashAccountId: null,
        amount: 100,
        currency: 'UZS',
        receiptId,
        receipt: { currency: 'UZS', exchangeRate: 1 },
        counterparty: { id: 'carrier-1', name: 'Carrier' },
        items: [],
      });

      await expect(
        service.postExpense(tenantId, userId, 'exp-missing-account'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('posts a paid USD expense through the USD bank ledger account', async () => {
      const expense = {
        id: 'exp-usd-paid',
        tenantId,
        docNumber: 'EXP-USD-0001',
        docDate: new Date(),
        status: PurchaseDocStatus.DRAFT,
        amount: 100,
        currency: 'USD',
        exchangeRate: 12800,
        receiptId,
        receipt: { currency: 'UZS', exchangeRate: 1 },
        isPaid: true,
        cashAccountId: 'bank-usd',
        cashAccount: {
          id: 'bank-usd',
          accountType: 'BANK',
          currency: 'USD',
        },
        counterpartyId: 'carrier-1',
        counterparty: { id: 'carrier-1', name: 'Silk Road Logistics' },
        vatAmount: 0,
        items: [] as unknown[],
      };
      expense.items = draftLines(expense, ['item-1']);
      prisma.additionalExpense.findFirst.mockResolvedValue(expense);
      prisma.additionalExpenseItem.findMany.mockResolvedValue(expense.items);
      prisma.cashAccount.findFirst.mockResolvedValue({
        ...expense.cashAccount,
        tenantId,
        balance: 500,
        isActive: true,
      });
      prisma.additionalExpense.update.mockResolvedValue({
        ...expense,
        status: PurchaseDocStatus.POSTED,
      });

      await service.postExpense(tenantId, userId, expense.id);

      // 100 USD on a UZS receipt: the receipt total grows in UZS.
      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { tenantId, id: receiptId },
        data: { additionalExpensesTotal: { increment: dec(1280000) } },
      });
      expect(prisma.financeTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'bank-usd',
            currency: 'USD',
            amount: 100,
          }),
        }),
      );
      expect(prisma.journalEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lines: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({
                  creditAccountId: 'acc-5210',
                  amount: 1280000,
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('posts expense on unsold inventory, updating ProductBatch and Product.costPrice', async () => {
      const mockExpense = {
        id: 'exp-1',
        tenantId,
        docNumber: 'EXP-2026-0001',
        docDate: new Date(),
        status: PurchaseDocStatus.DRAFT,
        amount: 1000000,
        currency: 'UZS',
        receiptId,
        receipt: { currency: 'UZS', exchangeRate: 1 },
        isPaid: false,
        vatAmount: 0,
        counterpartyId: 'carrier-1',
        counterparty: { id: 'carrier-1', name: 'Silk Road Logistics' },
        items: [] as unknown[],
      };
      mockExpense.items = draftLines(mockExpense, ['item-1']);
      prisma.additionalExpenseItem.findMany.mockResolvedValue(
        mockExpense.items,
      );

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
        where: {
          tenantId: 'tenant-123',
          id: 'batch-1',
        },
        data: { landedCost: dec(1100000) },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', id: 'prod-iphone' },
        data: {
          costPrice: 1100000,
          costPriceCurrency: 'UZS',
          costPriceExchangeRate: 1,
        },
      });
      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId,
          counterpartyId: 'carrier-1',
          currency: 'UZS',
          side: CounterpartySettlementSide.SUPPLIER,
          amount: 1000000,
          entryType: 'ADDITIONAL_EXPENSE_POSTED',
          sourceDocType: 'AdditionalExpense',
          sourceDocId: 'exp-1',
        }),
      );
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
        currency: 'UZS',
        receiptId,
        receipt: { currency: 'UZS', exchangeRate: 1 },
        isPaid: false,
        vatAmount: 0,
        counterpartyId: 'carrier-1',
        counterparty: { id: 'carrier-1', name: 'Silk Road Logistics' },
        items: [] as unknown[],
      };
      mockExpense.items = draftLines(mockExpense, ['item-1']);
      prisma.additionalExpenseItem.findMany.mockResolvedValue(
        mockExpense.items,
      );

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
        currency: 'UZS',
        exchangeRate: 1,
        totalAmount: 9000000,
        vatAmount: 0,
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
        where: {
          invoice: { tenantId: 'tenant-123' },
          id: 'inv-item-1',
        },
        data: {
          unitCogs: dec(1100000),
          lineCogs: dec(6600000),
          lineGrossProfit: 2400000,
        },
      });

      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', id: 'inv-1' },
        data: {
          totalCogs: dec(6600000),
          grossProfit: 2400000,
        },
      });
    });
    it('recalibrates a USD sale with VAT as net revenue in UZS minus COGS (ADR 0008/0011)', async () => {
      const mockExpense = {
        id: 'exp-2',
        tenantId,
        docNumber: 'EXP-2026-0002',
        docDate: new Date(),
        status: PurchaseDocStatus.DRAFT,
        amount: 1000000,
        currency: 'UZS',
        receiptId,
        receipt: { currency: 'UZS', exchangeRate: 1 },
        isPaid: false,
        vatAmount: 0,
        counterpartyId: 'carrier-1',
        counterparty: { id: 'carrier-1', name: 'Silk Road Logistics' },
        items: [] as unknown[],
      };
      mockExpense.items = draftLines(mockExpense, ['item-1']);
      prisma.additionalExpenseItem.findMany.mockResolvedValue(
        mockExpense.items,
      );
      // 6 sold for 672 USD = 600 net + 72 VAT at 12,500 UZS/USD.
      const invoice = {
        id: 'inv-usd',
        currency: 'USD',
        exchangeRate: 12500,
        totalAmount: 672,
        vatAmount: 72,
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
            salesInvoiceItemId: 'inv-item-usd',
            salesInvoiceItem: {
              id: 'inv-item-usd',
              invoiceId: 'inv-usd',
              productId: 'prod-iphone',
              quantity: 6,
              unitPrice: 100,
              totalPrice: 672,
              vatAmount: 72,
              unitCogs: 1000000,
              lineCogs: 6000000,
              lineGrossProfit: 1500000,
              invoice,
            },
          },
        ],
      });
      prisma.salesInvoiceItem.findMany.mockResolvedValue([
        { id: 'inv-item-usd', lineCogs: 6600000 },
      ]);
      prisma.salesInvoice.findUnique.mockResolvedValue(invoice);
      prisma.additionalExpense.update.mockResolvedValue({
        ...mockExpense,
        status: PurchaseDocStatus.POSTED,
      });

      await service.postExpense(tenantId, userId, 'exp-2');

      // 600 USD x 12,500 = 7,500,000 UZS net revenue - 6,600,000 COGS.
      expect(prisma.salesInvoiceItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lineGrossProfit: 900000 }),
        }),
      );
      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', id: 'inv-usd' },
        data: { totalCogs: dec(6600000), grossProfit: 900000 },
      });
    });
  });

  describe('cancelExpense & Rollback Guardrail', () => {
    // lockDocumentStatus: the expense being cancelled is posted.
    beforeEach(() => {
      prisma.$queryRaw.mockResolvedValue([{ status: 'POSTED' }]);
    });
    const docDate = new Date('2026-11-01T00:00:00Z');
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

    it('blocks cancellation while a FIFO Finance payment is applied to it', async () => {
      prisma.additionalExpense.findFirst.mockResolvedValue({
        id: 'exp-1',
        status: PurchaseDocStatus.POSTED,
        amount: 500000,
        items: [],
      });
      prisma.financeTransaction.findFirst.mockResolvedValue(null);
      prisma.settlementAllocation.findMany.mockResolvedValue([
        { amount: 300000 },
      ]);

      await expect(
        service.cancelExpense(tenantId, userId, 'exp-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns the cash of a paid-at-posting expense when it is cancelled', async () => {
      prisma.additionalExpense.findFirst.mockResolvedValue({
        id: 'exp-1',
        docNumber: 'AE-1',
        status: PurchaseDocStatus.POSTED,
        currency: 'UZS',
        amount: 500000,
        receiptId,
        receipt: { currency: 'UZS', exchangeRate: 1 },
        isPaid: true,
        counterpartyId: 'carrier-1',
        items: [],
      });
      prisma.financeTransaction.findFirst
        .mockResolvedValueOnce(null) // no later Finance payment
        .mockResolvedValueOnce({
          id: 'ft-posting',
          accountId: 'acc-cash',
          amount: 500000,
          settlementSide: null,
        });
      prisma.additionalExpense.update.mockResolvedValue({
        id: 'exp-1',
        status: PurchaseDocStatus.CANCELLED,
      });

      await service.cancelExpense(tenantId, userId, 'exp-1');

      expect(prisma.cashAccount.update).toHaveBeenCalledWith({
        where: { tenantId, id: 'acc-cash' },
        data: { balance: { increment: 500000 } },
      });
      expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ft-posting', tenantId, status: 'POSTED' },
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    });

    it('cleanly cancels and restores batch and sales COGS when no active cash payment', async () => {
      prisma.additionalExpense.findFirst.mockResolvedValue({
        id: 'exp-1',
        status: PurchaseDocStatus.POSTED,
        currency: 'UZS',
        amount: 1000000,
        receiptId,
        receipt: { currency: 'UZS', exchangeRate: 1 },
        isPaid: false,
        counterpartyId: 'carrier-1',
        items: draftLines({ amount: 1000000, currency: 'UZS', docDate }, [
          'item-1',
        ]),
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
        currency: 'UZS',
        exchangeRate: 1,
        totalAmount: 9000000,
        vatAmount: 0,
      });
      prisma.additionalExpense.update.mockResolvedValue({
        id: 'exp-1',
        status: PurchaseDocStatus.CANCELLED,
      });

      const res = await service.cancelExpense(tenantId, userId, 'exp-1');

      expect(res.status).toBe(PurchaseDocStatus.CANCELLED);
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          id: 'batch-1',
        },
        data: { landedCost: dec(1000000) }, // Restored to initial
      });
      expect(prisma.salesInvoiceItem.update).toHaveBeenCalledWith({
        where: { invoice: { tenantId: 'tenant-123' }, id: 'inv-item-1' },
        data: {
          unitCogs: dec(1000000), // Restored to 1,000,000
          lineCogs: dec(6000000),
          lineGrossProfit: 3000000,
        },
      });
    });

    it('cancelling a USD expense removes the same UZS amount posting added, and keeps a USD card in USD', async () => {
      // 80 USD × 12,500 = 1,000,000 UZS over 10 units → 100,000 UZS per unit.
      prisma.additionalExpense.findFirst.mockResolvedValue({
        id: 'exp-usd',
        status: PurchaseDocStatus.POSTED,
        currency: 'USD',
        exchangeRate: 12500,
        amount: 80,
        receiptId,
        receipt: { currency: 'UZS', exchangeRate: 1 },
        isPaid: false,
        counterpartyId: 'carrier-1',
        items: draftLines(
          { amount: 80, currency: 'USD', exchangeRate: 12500, docDate },
          ['item-1'],
        ),
      });
      prisma.financeTransaction.findFirst.mockResolvedValue(null);
      prisma.productBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        purchasePrice: 1000000,
        landedCost: 1100000,
        consumptions: [],
      });
      prisma.product.findFirst.mockResolvedValue({
        costPriceCurrency: 'USD',
        costPriceExchangeRate: 12500,
      });
      prisma.additionalExpense.update.mockResolvedValue({
        id: 'exp-usd',
        status: PurchaseDocStatus.CANCELLED,
      });

      await service.cancelExpense(tenantId, userId, 'exp-usd');

      // It used to subtract 8 (USD) from a UZS cost and leave 1,099,992.
      expect(prisma.productBatch.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', id: 'batch-1' },
        data: { landedCost: dec(1000000) },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', id: 'prod-iphone' },
        data: {
          costPrice: 80,
          costPriceCurrency: 'USD',
          costPriceExchangeRate: 12500,
        },
      });
    });

    it('refuses to cancel a posted row without a stored conversion instead of using a fresh rate', async () => {
      // A row posted before the snapshot whose rate could not be backfilled.
      prisma.additionalExpense.findFirst.mockResolvedValue({
        id: 'exp-legacy',
        status: PurchaseDocStatus.POSTED,
        currency: 'USD',
        exchangeRate: 0,
        amount: 5,
        receiptId,
        isPaid: false,
        counterpartyId: 'carrier-1',
        items: [
          {
            id: 'ei-legacy',
            productId: 'prod-iphone',
            receiptItemId: 'item-1',
            allocatedAmount: 5,
            originalCurrency: null,
            baseUnitDelta: null,
            receiptAmount: null,
            receiptUnitDelta: null,
          },
        ],
      });
      prisma.financeTransaction.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelExpense(tenantId, userId, 'exp-legacy'),
      ).rejects.toThrow(/kurs ma'lumotlari saqlanmagan/);
      expect(prisma.productBatch.update).not.toHaveBeenCalled();
      expect(prisma.purchaseReceipt.update).not.toHaveBeenCalled();
    });

    it('a USD expense on a USD receipt adds and removes the same USD amount on the receipt total (ADR 0023)', async () => {
      // PUR-2026-0001 / EXP-2026-0001: posting added 6 × 12,000 = 72,000 to a
      // USD receipt and cancelling removed 6, leaving 71,994 behind.
      const expense = {
        id: 'exp-usd-on-usd',
        status: PurchaseDocStatus.POSTED,
        currency: 'USD',
        exchangeRate: 12000,
        amount: 6,
        receiptId,
        receipt: { currency: 'USD', exchangeRate: 12000 },
        isPaid: false,
        counterpartyId: 'carrier-1',
        items: draftLines(
          { amount: 6, currency: 'USD', exchangeRate: 12000, docDate },
          ['item-1'],
          { currency: 'USD', exchangeRate: 12000 },
        ),
      };
      prisma.additionalExpense.findFirst.mockResolvedValue(expense);
      prisma.financeTransaction.findFirst.mockResolvedValue(null);
      prisma.additionalExpense.update.mockResolvedValue({
        id: expense.id,
        status: PurchaseDocStatus.CANCELLED,
      });

      await service.cancelExpense(tenantId, userId, expense.id);

      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { tenantId, id: receiptId },
        data: { additionalExpensesTotal: { decrement: dec(6) } },
      });
    });

    it('restores the profit of a USD sale with VAT as net revenue in UZS minus COGS on cancel', async () => {
      prisma.additionalExpense.findFirst.mockResolvedValue({
        id: 'exp-2',
        status: PurchaseDocStatus.POSTED,
        currency: 'UZS',
        amount: 1000000,
        receiptId,
        receipt: { currency: 'UZS', exchangeRate: 1 },
        isPaid: false,
        counterpartyId: 'carrier-1',
        items: draftLines({ amount: 1000000, currency: 'UZS', docDate }, [
          'item-1',
        ]),
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
            salesInvoiceItemId: 'inv-item-usd',
            salesInvoiceItem: {
              id: 'inv-item-usd',
              invoiceId: 'inv-usd',
              totalPrice: 672,
              vatAmount: 72,
              unitCogs: 1100000,
              lineCogs: 6600000,
            },
          },
        ],
      });
      prisma.salesInvoiceItem.findMany.mockResolvedValue([
        { id: 'inv-item-usd', lineCogs: 6600000 },
      ]);
      prisma.salesInvoice.findUnique.mockResolvedValue({
        id: 'inv-usd',
        currency: 'USD',
        exchangeRate: 12500,
        totalAmount: 672,
        vatAmount: 72,
      });
      prisma.additionalExpense.update.mockResolvedValue({
        id: 'exp-2',
        status: PurchaseDocStatus.CANCELLED,
      });

      await service.cancelExpense(tenantId, userId, 'exp-2');

      // 600 USD x 12,500 = 7,500,000 UZS - 6,000,000 restored COGS.
      expect(prisma.salesInvoiceItem.update).toHaveBeenCalledWith({
        where: { invoice: { tenantId: 'tenant-123' }, id: 'inv-item-usd' },
        data: {
          unitCogs: dec(1000000),
          lineCogs: dec(6000000),
          lineGrossProfit: 1500000,
        },
      });
      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', id: 'inv-usd' },
        data: { totalCogs: dec(6000000), grossProfit: 1500000 },
      });
    });
  });
});
