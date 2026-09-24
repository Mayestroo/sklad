import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { OpeningBalancesService } from './opening-balances.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  OpeningBalanceStatus,
  OpeningBalanceCategory,
  TransactionDirection,
  TransactionStatus,
  CounterpartySettlementSide,
} from '@prisma/client';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';

describe('OpeningBalancesService Unit & Invariant Test Suite', () => {
  let service: OpeningBalancesService;
  let prisma: any;
  let settlementService: { recordMovement: jest.Mock };

  beforeEach(async () => {
    settlementService = { recordMovement: jest.fn().mockResolvedValue({ created: true }) };
    prisma = {
      openingBalanceDocument: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      openingBalanceLine: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      cashAccount: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      financeTransaction: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      stockLevel: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
      productBatch: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      counterparty: {
        update: jest.fn(),
      },
      fixedAsset: {
        update: jest.fn(),
      },
      account: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      journalEntry: {
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      journalLine: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpeningBalancesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CounterpartySettlementService, useValue: settlementService },
      ],
    }).compile();

    service = module.get<OpeningBalancesService>(OpeningBalancesService);
  });

  describe('Document Creation & Balance Calculation', () => {
    it('should create draft document and calculate metrics accurately', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue(null);
      prisma.openingBalanceDocument.create.mockImplementation((args: any) => ({
        id: 'doc-1',
        ...args.data,
      }));

      const dto = {
        openingDate: '2026-10-01',
        docNumber: 'OB-2026-0001',
        lines: [
          {
            category: OpeningBalanceCategory.CASH,
            amount: 25000000,
            accountId: 'acc-cash',
          },
          {
            category: OpeningBalanceCategory.BANK,
            amount: 100000000,
            accountId: 'acc-bank',
          },
          {
            category: OpeningBalanceCategory.INVENTORY,
            amount: 50000000,
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 500,
            unitCost: 100000,
          },
          {
            category: OpeningBalanceCategory.SUPPLIER_DEBT,
            amount: 30000000,
            counterpartyId: 'supp-1',
          },
          {
            category: OpeningBalanceCategory.EQUITY,
            amount: 145000000,
          },
        ],
      };

      const result = await service.create('tenant-1', 'user-1', dto);

      expect(result).toBeDefined();
      expect(prisma.openingBalanceDocument.create).toHaveBeenCalled();
      const callData = prisma.openingBalanceDocument.create.mock.calls[0][0].data;

      // Total Assets: 25M + 100M + 50M = 175,000,000
      expect(callData.totalAssets).toBe(175000000);
      // Total Liabilities: 30,000,000
      expect(callData.totalLiabilities).toBe(30000000);
      // Total Equity: 145,000,000
      expect(callData.totalEquity).toBe(145000000);
      // Balance Difference: 175M - (30M + 145M) = 0
      expect(callData.balanceDifference).toBe(0);
    });

    it('should reject creation if document number already exists', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create('tenant-1', 'user-1', {
          openingDate: '2026-10-01',
          docNumber: 'OB-2026-0001',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Post / Tasdiqlash Invariant Checks', () => {
    it('should reject posting if Assets != Liabilities + Equity (unbalanced equation)', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue({
        id: 'doc-unbalanced',
        tenantId: 'tenant-1',
        docNumber: 'OB-UNBALANCED',
        status: OpeningBalanceStatus.DRAFT,
        lines: [
          {
            category: OpeningBalanceCategory.CASH,
            amount: 50000000,
          },
          {
            category: OpeningBalanceCategory.SUPPLIER_DEBT,
            amount: 10000000,
          },
          // Missing equity: 50M != 10M + 0
        ],
      });

      await expect(service.post('tenant-1', 'user-1', 'doc-unbalanced')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should execute full atomic posting when balance is equal to zero difference', async () => {
      const doc = {
        id: 'doc-balanced',
        tenantId: 'tenant-1',
        docNumber: 'OB-BALANCED',
        openingDate: new Date('2026-10-01'),
        updatedAt: new Date('2026-09-23T12:00:00.000Z'),
        status: OpeningBalanceStatus.DRAFT,
        lines: [
          {
            category: OpeningBalanceCategory.CASH,
            accountId: 'acc-cash',
            amount: 25000000,
            currency: 'UZS',
          },
          {
            category: OpeningBalanceCategory.INVENTORY,
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 100,
            unitCost: 50000,
            amount: 5000000,
            batchNumber: 'INIT-B1',
          },
          {
            id: 'line-customer',
            category: OpeningBalanceCategory.CUSTOMER_DEBT,
            counterpartyId: 'cust-1',
            currency: 'USD',
            amount: 10000000,
          },
          {
            id: 'line-supplier',
            category: OpeningBalanceCategory.SUPPLIER_DEBT,
            counterpartyId: 'supp-1',
            currency: 'USD',
            amount: 10000000,
          },
          {
            category: OpeningBalanceCategory.EQUITY,
            amount: 30000000, // Assets (25M + 5M + 10M = 40M) - Liab (10M) = 30M
          },
        ],
      };

      prisma.openingBalanceDocument.findFirst.mockResolvedValue(doc);
      prisma.account.findFirst.mockResolvedValue({ id: 'acc-00', code: '00' });
      prisma.journalEntry.create.mockResolvedValue({ id: 'je-1' });
      prisma.openingBalanceDocument.update.mockResolvedValue({
        ...doc,
        status: OpeningBalanceStatus.POSTED,
      });

      const res = await service.post('tenant-1', 'user-1', 'doc-balanced');

      expect(res.status).toBe(OpeningBalanceStatus.POSTED);

      // 1. CashAccount incremented
      expect(prisma.cashAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-cash' },
        data: { balance: { increment: 25000000 } },
      });

      // 2. FinanceTransaction recorded with OPENING_BALANCE
      expect(prisma.financeTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          direction: TransactionDirection.INCOME,
          status: TransactionStatus.POSTED,
          amount: 25000000,
          sourceDocType: 'OpeningBalanceDocument',
        }),
      });

      // 3. StockLevel upserted
      expect(prisma.stockLevel.upsert).toHaveBeenCalledWith({
        where: expect.anything(),
        create: expect.objectContaining({ quantity: 100 }),
        update: expect.objectContaining({ quantity: { increment: 100 } }),
      });

      // 4. ProductBatch created with receiptId = null
      expect(prisma.productBatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          batchNumber: 'INIT-B1',
          initialQty: 100,
          remainingQty: 100,
          receiptId: null,
        }),
      });

      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId: 'tenant-1',
        counterpartyId: 'cust-1',
        currency: 'USD',
        side: CounterpartySettlementSide.CUSTOMER,
        amount: 10000000,
        sourceDocType: 'OpeningBalanceLine',
        sourceDocId: 'line-customer',
      }));
      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId: 'tenant-1',
        counterpartyId: 'supp-1',
        currency: 'USD',
        side: CounterpartySettlementSide.SUPPLIER,
        amount: 10000000,
        sourceDocType: 'OpeningBalanceLine',
        sourceDocId: 'line-supplier',
      }));
    });
  });

  describe('Unpost & The Rollback Invariant', () => {
    it('should block reopening if inventory batch has been consumed (Rollback Invariant)', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue({
        id: 'doc-posted',
        tenantId: 'tenant-1',
        docNumber: 'OB-POSTED',
        status: OpeningBalanceStatus.POSTED,
        lines: [
          {
            category: OpeningBalanceCategory.INVENTORY,
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 100,
            amount: 5000000,
            batchNumber: 'INIT-BATCH-X',
          },
        ],
      });

      // Mock that remainingQty < initialQty (part of batch was sold in a sales invoice!)
      prisma.productBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          batchNumber: 'INIT-BATCH-X',
          initialQty: 100,
          remainingQty: 40, // 60 units were consumed!
        },
      ]);

      await expect(service.unpost('tenant-1', 'user-1', 'doc-posted')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block reopening if cash account balance has dropped below opening deposit', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue({
        id: 'doc-posted-cash',
        tenantId: 'tenant-1',
        docNumber: 'OB-CASH',
        status: OpeningBalanceStatus.POSTED,
        lines: [
          {
            category: OpeningBalanceCategory.CASH,
            accountId: 'acc-cash',
            amount: 25000000,
          },
        ],
      });

      // Current cash balance is only 10M (15M was spent!)
      prisma.cashAccount.findUnique.mockResolvedValue({
        id: 'acc-cash',
        balance: 10000000,
      });

      await expect(service.unpost('tenant-1', 'user-1', 'doc-posted-cash')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should safely execute unposting reversal when all balances and batches are intact', async () => {
      const doc = {
        id: 'doc-intact',
        tenantId: 'tenant-1',
        docNumber: 'OB-INTACT',
        openingDate: new Date('2026-10-01'),
        updatedAt: new Date('2026-09-23T12:00:00.000Z'),
        status: OpeningBalanceStatus.POSTED,
        lines: [
          {
            category: OpeningBalanceCategory.CASH,
            accountId: 'acc-cash',
            amount: 25000000,
          },
          {
            category: OpeningBalanceCategory.INVENTORY,
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 100,
            batchNumber: 'INIT-INTACT-1',
          },
          {
            id: 'line-customer',
            category: OpeningBalanceCategory.CUSTOMER_DEBT,
            counterpartyId: 'cust-1',
            currency: 'USD',
            amount: 10000000,
          },
        ],
      };

      prisma.openingBalanceDocument.findFirst.mockResolvedValue(doc);
      prisma.cashAccount.findUnique.mockResolvedValue({
        id: 'acc-cash',
        balance: 50000000, // Sufficient
      });
      prisma.productBatch.findMany.mockResolvedValue([
        {
          id: 'batch-intact',
          batchNumber: 'INIT-INTACT-1',
          initialQty: 100,
          remainingQty: 100, // Intact!
        },
      ]);
      prisma.journalEntry.findFirst.mockResolvedValue({ id: 'je-1' });
      prisma.openingBalanceDocument.update.mockResolvedValue({
        ...doc,
        status: OpeningBalanceStatus.DRAFT,
      });

      const result = await service.unpost('tenant-1', 'user-1', 'doc-intact', {
        reason: 'Correction needed',
      });

      expect(result.status).toBe(OpeningBalanceStatus.DRAFT);
      // Cash decremented
      expect(prisma.cashAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-cash' },
        data: { balance: { decrement: 25000000 } },
      });
      // Stock decremented
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: expect.anything(),
        data: { quantity: { decrement: 100 } },
      });
      // Batch deleted
      expect(prisma.productBatch.deleteMany).toHaveBeenCalled();
      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId: 'tenant-1',
        counterpartyId: 'cust-1',
        currency: 'USD',
        side: CounterpartySettlementSide.CUSTOMER,
        amount: -10000000,
        entryType: 'OPENING_BALANCE_UNPOSTED',
        sourceDocType: 'OpeningBalanceLine',
        sourceDocId: 'line-customer',
      }));
    });
  });

  describe('Cutoff Date Validation Gate', () => {
    it('should reject operational transactions dated before posted opening balance date', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue({
        id: 'ob-1',
        openingDate: new Date('2026-10-01'),
        status: OpeningBalanceStatus.POSTED,
      });

      // Transaction dated Sept 15, 2026 (before Oct 1, 2026)
      await expect(
        service.checkCutoffDate('tenant-1', new Date('2026-09-15')),
      ).rejects.toThrow(BadRequestException);

      // Transaction dated Oct 5, 2026 (valid)
      const valid = await service.checkCutoffDate('tenant-1', new Date('2026-10-05'));
      expect(valid).toBe(true);
    });
  });
});
