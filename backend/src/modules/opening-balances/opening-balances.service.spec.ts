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
import { AccountsService } from '../accounting/accounts/accounts.service';
import { JournalService } from '../accounting/journal/journal.service';

jest.mock('../../common/sequences/document-sequence');
jest.mock('../../common/prisma/assert-tenant-owned');
jest.mock('../../common/accounting-period/period-lock');

describe('OpeningBalancesService Unit & Invariant Test Suite', () => {
  let service: OpeningBalancesService;
  let prisma: any;
  let settlementService: { recordMovement: jest.Mock };

  beforeEach(async () => {
    settlementService = {
      recordMovement: jest.fn().mockResolvedValue({ created: true }),
    };
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
        findFirst: jest.fn(),
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
      product: {
        updateMany: jest.fn(),
      },
      fixedAsset: {
        update: jest.fn(),
      },
      account: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      journalEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      journalLine: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalService,
        OpeningBalancesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CounterpartySettlementService, useValue: settlementService },
        {
          provide: AccountsService,
          useValue: { ensureDefaultAccounts: jest.fn() },
        },
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
            currency: 'UZS',
            exchangeRate: 1,
            accountId: 'acc-cash',
          },
          {
            category: OpeningBalanceCategory.BANK,
            amount: 100000000,
            currency: 'UZS',
            exchangeRate: 1,
            accountId: 'acc-bank',
          },
          {
            category: OpeningBalanceCategory.INVENTORY,
            amount: 50000000,
            currency: 'UZS',
            exchangeRate: 1,
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 500,
            unitCost: 100000,
          },
          {
            category: OpeningBalanceCategory.SUPPLIER_DEBT,
            amount: 30000000,
            currency: 'UZS',
            exchangeRate: 1,
            counterpartyId: 'supp-1',
          },
          {
            category: OpeningBalanceCategory.EQUITY,
            amount: 145000000,
            currency: 'UZS',
            exchangeRate: 1,
          },
        ],
      };

      const result = await service.create('tenant-1', 'user-1', dto);

      expect(result).toBeDefined();
      // A cash/bank line's accountId is a CashAccount (kassa), not a chart
      // of accounts row; every referenced id is checked against the tenant.
      const { assertTenantOwned } = jest.requireMock<{
        assertTenantOwned: jest.Mock;
      }>('../../common/prisma/assert-tenant-owned');
      expect(assertTenantOwned).toHaveBeenCalledWith(prisma, 'tenant-1', {
        cashAccount: ['acc-cash', 'acc-bank', undefined, undefined, undefined],
        product: [undefined, undefined, 'prod-1', undefined, undefined],
        warehouse: [undefined, undefined, 'wh-1', undefined, undefined],
        counterparty: [undefined, undefined, undefined, 'supp-1', undefined],
        fixedAsset: [undefined, undefined, undefined, undefined, undefined],
      });
      expect(prisma.openingBalanceDocument.create).toHaveBeenCalled();
      const callData =
        prisma.openingBalanceDocument.create.mock.calls[0][0].data;

      // Total Assets: 25M + 100M + 50M = 175,000,000
      expect(callData.totalAssets).toBe(175000000);
      // Total Liabilities: 30,000,000
      expect(callData.totalLiabilities).toBe(30000000);
      // Total Equity: 145,000,000
      expect(callData.totalEquity).toBe(145000000);
      // Balance Difference: 175M - (30M + 145M) = 0
      expect(callData.balanceDifference).toBe(0);
    });

    it('B6: rejects a fixed asset whose accumulated depreciation exceeds its cost (no silent clamp to 0)', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue(null);
      prisma.openingBalanceDocument.create.mockClear();
      const fixedAsset = (accumulatedDepreciation: number) => ({
        openingDate: '2026-10-01',
        docNumber: 'OB-2026-0002',
        lines: [
          {
            category: OpeningBalanceCategory.FIXED_ASSET,
            amount: 1000000,
            accumulatedDepreciation,
            currency: 'UZS',
            exchangeRate: 1,
          },
        ],
      });

      await expect(
        service.create('tenant-1', 'user-1', fixedAsset(1500000)),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.openingBalanceDocument.create).not.toHaveBeenCalled();

      prisma.openingBalanceDocument.create.mockImplementation((args: any) => ({
        id: 'doc-2',
        ...args.data,
      }));
      await service.create('tenant-1', 'user-1', fixedAsset(400000));
      const line =
        prisma.openingBalanceDocument.create.mock.calls[0][0].data.lines
          .create[0];
      expect(line.netAmount).toBe(600000);
    });

    it('stores an inventory amount as quantity × unit cost, whatever total was typed', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue(null);
      prisma.openingBalanceDocument.create.mockImplementation((args: any) => ({
        id: 'doc-3',
        ...args.data,
      }));
      await service.create('tenant-1', 'user-1', {
        openingDate: '2026-10-01',
        docNumber: 'OB-2026-0003',
        lines: [
          {
            category: OpeningBalanceCategory.INVENTORY,
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 2,
            unitCost: 4,
            amount: 999,
            currency: 'USD',
            exchangeRate: 12500,
          },
        ],
      });
      const data = prisma.openingBalanceDocument.create.mock.calls[0][0].data;
      expect(data.lines.create[0].amount).toBe(8);
      expect(data.totalAssets).toBe(100000);
      // Nothing entered as capital: all of it is retained earnings.
      expect(data.totalEquity).toBe(100000);
      expect(data.balanceDifference).toBe(100000);
    });

    it('should reject creation if document number already exists', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue({
        id: 'existing',
      });

      await expect(
        service.create('tenant-1', 'user-1', {
          openingDate: '2026-10-01',
          docNumber: 'OB-2026-0001',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Post / Tasdiqlash Invariant Checks', () => {
    it('compares opening balances in UZS but posts cash in the account currency', async () => {
      const doc = {
        id: 'doc-mixed-currency',
        tenantId: 'tenant-1',
        docNumber: 'OB-MIXED-001',
        openingDate: new Date('2026-10-01'),
        updatedAt: new Date('2026-10-01T00:00:00.000Z'),
        status: OpeningBalanceStatus.DRAFT,
        lines: [
          {
            id: 'line-usd-cash',
            category: OpeningBalanceCategory.CASH,
            accountId: 'cash-usd',
            amount: 10,
            currency: 'USD',
            exchangeRate: 12500,
          },
          {
            id: 'line-equity',
            category: OpeningBalanceCategory.EQUITY,
            amount: 125000,
            currency: 'UZS',
            exchangeRate: 1,
          },
        ],
      };
      prisma.openingBalanceDocument.findFirst.mockResolvedValue(doc);
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'cash-usd',
        accountType: 'USD_CASH',
        currency: 'USD',
      });
      prisma.account.findFirst.mockImplementation(({ where }: any) => ({
        id: `account-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.create.mockResolvedValue({ id: 'journal-1' });
      prisma.openingBalanceDocument.update.mockResolvedValue({
        ...doc,
        status: OpeningBalanceStatus.POSTED,
      });

      await service.post('tenant-1', 'user-1', doc.id);

      expect(prisma.cashAccount.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'cash-usd' },
        data: { balance: { increment: 10 } },
      });
      expect(prisma.financeTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 10, currency: 'USD' }),
        }),
      );
      expect(prisma.journalEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entryNumber: expect.stringMatching(/^JE-\d{4}-\d{5}$/),
            sourceDocType: 'OpeningBalanceDocument',
            lines: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  debitAccountId: 'account-5020',
                  amount: 125000,
                }),
                expect.objectContaining({
                  creditAccountId: 'account-8330',
                  amount: 125000,
                }),
              ]),
            },
          }),
        }),
      );
    });

    it('refuses lines that would reach no kassa, warehouse or counterparty, before any write', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue({
        id: 'doc-incomplete',
        tenantId: 'tenant-1',
        docNumber: 'OB-INCOMPLETE',
        status: OpeningBalanceStatus.DRAFT,
        lines: [
          {
            category: OpeningBalanceCategory.INVENTORY,
            productId: 'prod-1',
            warehouseId: null,
            quantity: 1,
            unitCost: 10,
            amount: 10,
            currency: 'UZS',
            exchangeRate: 1,
          },
          {
            category: OpeningBalanceCategory.SUPPLIER_DEBT,
            counterpartyId: null,
            amount: 10,
            currency: 'UZS',
            exchangeRate: 1,
          },
        ],
      });

      await expect(
        service.post('tenant-1', 'user-1', 'doc-incomplete'),
      ).rejects.toThrow(
        /Tovarlar \/ Товары 1: tovar yoki ombor.*Qarzlar \/ Долги 1: kontragent/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('posts every category to its ledger account and closes 00 with retained earnings', async () => {
      const doc = {
        id: 'doc-ledger',
        tenantId: 'tenant-1',
        docNumber: 'OB-LEDGER',
        openingDate: new Date('2026-10-01'),
        updatedAt: new Date('2026-10-01T00:00:00.000Z'),
        status: OpeningBalanceStatus.DRAFT,
        lines: [
          {
            id: 'l1',
            category: OpeningBalanceCategory.SUPPLIER_ADVANCE,
            counterpartyId: 's1',
            amount: 300,
            currency: 'UZS',
            exchangeRate: 1,
          },
          {
            id: 'l2',
            category: OpeningBalanceCategory.CUSTOMER_ADVANCE,
            counterpartyId: 'c1',
            amount: 100,
            currency: 'UZS',
            exchangeRate: 1,
          },
          {
            id: 'l3',
            category: OpeningBalanceCategory.OTHER_ASSET,
            amount: 50,
            currency: 'UZS',
            exchangeRate: 1,
          },
          {
            id: 'l4',
            category: OpeningBalanceCategory.OTHER_LIABILITY,
            amount: 20,
            currency: 'UZS',
            exchangeRate: 1,
          },
          {
            id: 'l5',
            category: OpeningBalanceCategory.FIXED_ASSET,
            fixedAssetId: 'fa-1',
            amount: 1000,
            accumulatedDepreciation: 400,
            netAmount: 600,
            currency: 'UZS',
            exchangeRate: 1,
          },
          {
            id: 'l6',
            category: OpeningBalanceCategory.EQUITY,
            amount: 500,
            currency: 'UZS',
            exchangeRate: 1,
          },
        ],
      };
      prisma.openingBalanceDocument.findFirst.mockResolvedValue(doc);
      prisma.fixedAsset.findMany = jest
        .fn()
        .mockResolvedValue([
          { id: 'fa-1', initialCost: 1000, accumulatedDepreciation: 400 },
        ]);
      prisma.openingBalanceLine.findFirst = jest.fn().mockResolvedValue(null);
      prisma.account.findFirst.mockImplementation(({ where }: any) => ({
        id: `account-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.create.mockResolvedValue({ id: 'je' });
      prisma.openingBalanceDocument.update.mockResolvedValue(doc);

      await service.post('tenant-1', 'user-1', doc.id);

      const lines =
        prisma.journalEntry.create.mock.calls[0][0].data.lines.create;
      const pairs = lines.map((l: any) => [
        l.debitAccountId,
        l.creditAccountId,
        l.amount,
      ]);
      expect(pairs).toEqual(
        expect.arrayContaining([
          ['account-6010', 'account-00', 300],
          ['account-4890', 'account-00', 50],
          ['account-0100', 'account-00', 1000],
          ['account-00', 'account-4010', 100],
          ['account-00', 'account-6990', 20],
          ['account-00', 'account-0200', 400],
          ['account-00', 'account-8330', 500],
          // assets 300 + 50 + 600 − liabilities 120 − capital 500 = 330
          ['account-00', 'account-8710', 330],
        ]),
      );
      const net00 = lines.reduce(
        (sum: number, l: any) =>
          sum +
          (l.debitAccountId === 'account-00' ? l.amount : 0) -
          (l.creditAccountId === 'account-00' ? l.amount : 0),
        0,
      );
      expect(net00).toBe(0);
    });

    it('books a loss to 8710 when liabilities exceed assets (no manual balancing)', async () => {
      const doc = {
        id: 'doc-loss',
        tenantId: 'tenant-1',
        docNumber: 'OB-LOSS',
        openingDate: new Date('2026-10-01'),
        updatedAt: new Date('2026-10-01T00:00:00.000Z'),
        status: OpeningBalanceStatus.DRAFT,
        lines: [
          {
            id: 'l1',
            category: OpeningBalanceCategory.SUPPLIER_DEBT,
            counterpartyId: 's1',
            amount: 70,
            currency: 'UZS',
            exchangeRate: 1,
          },
        ],
      };
      prisma.openingBalanceDocument.findFirst.mockResolvedValue(doc);
      prisma.account.findFirst.mockImplementation(({ where }: any) => ({
        id: `account-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.create.mockResolvedValue({ id: 'je' });
      prisma.openingBalanceDocument.update.mockResolvedValue(doc);

      await service.post('tenant-1', 'user-1', doc.id);

      const lines =
        prisma.journalEntry.create.mock.calls[0][0].data.lines.create;
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            debitAccountId: 'account-00',
            creditAccountId: 'account-6010',
            amount: 70,
          }),
          expect.objectContaining({
            debitAccountId: 'account-8710',
            creditAccountId: 'account-00',
            amount: 70,
          }),
        ]),
      );
    });

    it('fails instead of skipping a journal line when a ledger account is missing', async () => {
      const doc = {
        id: 'doc-noacc',
        tenantId: 'tenant-1',
        docNumber: 'OB-NOACC',
        openingDate: new Date('2026-10-01'),
        updatedAt: new Date('2026-10-01T00:00:00.000Z'),
        status: OpeningBalanceStatus.DRAFT,
        lines: [
          {
            id: 'l1',
            category: OpeningBalanceCategory.EQUITY,
            amount: 70,
            currency: 'UZS',
            exchangeRate: 1,
          },
          {
            id: 'l2',
            category: OpeningBalanceCategory.OTHER_ASSET,
            amount: 70,
            currency: 'UZS',
            exchangeRate: 1,
          },
        ],
      };
      prisma.openingBalanceDocument.findFirst.mockResolvedValue(doc);
      prisma.account.findFirst.mockImplementation(({ where }: any) =>
        where.code === '8330' ? null : { id: `account-${where.code}` },
      );

      await expect(service.post('tenant-1', 'user-1', doc.id)).rejects.toThrow(
        /8330/,
      );
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
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
            exchangeRate: 1,
          },
          {
            id: 'line-inventory',
            category: OpeningBalanceCategory.INVENTORY,
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 100,
            unitCost: 50000,
            amount: 5000000,
            currency: 'UZS',
            exchangeRate: 1,
            batchNumber: 'INIT-B1',
          },
          {
            id: 'line-customer',
            category: OpeningBalanceCategory.CUSTOMER_DEBT,
            counterpartyId: 'cust-1',
            currency: 'USD',
            exchangeRate: 12500,
            amount: 10000000,
          },
          {
            id: 'line-supplier',
            category: OpeningBalanceCategory.SUPPLIER_DEBT,
            counterpartyId: 'supp-1',
            currency: 'USD',
            exchangeRate: 12500,
            amount: 10000000,
          },
          {
            category: OpeningBalanceCategory.EQUITY,
            amount: 30000000, // Assets (25M + 5M + 10M = 40M) - Liab (10M) = 30M
            currency: 'UZS',
            exchangeRate: 1,
          },
        ],
      };

      prisma.openingBalanceDocument.findFirst.mockResolvedValue(doc);
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc-cash',
        accountType: 'UZS_CASH',
        currency: 'UZS',
      });
      prisma.account.findFirst.mockImplementation(({ where }: any) => ({
        id: `account-${where.code}`,
        code: where.code,
      }));
      prisma.journalEntry.create.mockResolvedValue({ id: 'je-1' });
      prisma.openingBalanceDocument.update.mockResolvedValue({
        ...doc,
        status: OpeningBalanceStatus.POSTED,
      });

      const res = await service.post('tenant-1', 'user-1', 'doc-balanced');

      expect(res.status).toBe(OpeningBalanceStatus.POSTED);

      // 1. CashAccount incremented
      expect(prisma.cashAccount.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'acc-cash' },
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

      // 4. A FIFO batch linked to its line, aged at the opening date
      expect(prisma.productBatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          batchNumber: 'INIT-B1',
          initialQty: 100,
          remainingQty: 100,
          landedCost: 50000,
          createdAt: new Date('2026-10-01'),
          openingBalanceLineId: 'line-inventory',
        }),
      });
      // A product without a catalog cost takes the opening cost (ADR 0007).
      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'prod-1', costPrice: 0 },
        data: {
          costPrice: 50000,
          costPriceCurrency: 'UZS',
          costPriceExchangeRate: 1,
        },
      });

      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: 'tenant-1',
          counterpartyId: 'cust-1',
          currency: 'USD',
          side: CounterpartySettlementSide.CUSTOMER,
          amount: 10000000,
          sourceDocType: 'OpeningBalanceLine',
          sourceDocId: 'line-customer',
        }),
      );
      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: 'tenant-1',
          counterpartyId: 'supp-1',
          currency: 'USD',
          side: CounterpartySettlementSide.SUPPLIER,
          amount: 10000000,
          sourceDocType: 'OpeningBalanceLine',
          sourceDocId: 'line-supplier',
        }),
      );
    });
  });

  describe('D6: opening fixed assets are linked to register assets', () => {
    const asset = {
      id: 'fa-1',
      tenantId: 'tenant-1',
      initialCost: 1000000,
      accumulatedDepreciation: 400000,
    };
    const faLine = (over: Record<string, unknown> = {}) => ({
      id: 'line-fa',
      category: OpeningBalanceCategory.FIXED_ASSET,
      fixedAssetId: 'fa-1',
      amount: 1000000,
      accumulatedDepreciation: 400000,
      netAmount: 600000,
      currency: 'UZS',
      exchangeRate: 1,
      ...over,
    });
    const equity = {
      id: 'line-eq',
      category: OpeningBalanceCategory.EQUITY,
      amount: 600000,
      netAmount: 0,
      currency: 'UZS',
      exchangeRate: 1,
    };
    const docWith = (lines: unknown[]) => ({
      id: 'doc-fa',
      tenantId: 'tenant-1',
      docNumber: 'OB-FA',
      status: OpeningBalanceStatus.DRAFT,
      lines,
    });

    beforeEach(() => {
      prisma.fixedAsset.findMany = jest.fn().mockResolvedValue([asset]);
      prisma.openingBalanceLine.findFirst = jest.fn().mockResolvedValue(null);
      prisma.$transaction.mockResolvedValueOnce({
        id: 'doc-fa',
        status: 'POSTED',
      });
    });

    const rejects = async (lines: unknown[], message: RegExp) => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue(docWith(lines));
      await expect(
        service.post('tenant-1', 'user-1', 'doc-fa'),
      ).rejects.toThrow(message);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    };

    it('refuses to post a fixed-asset line that is not linked to a register asset', async () => {
      await rejects(
        [faLine({ fixedAssetId: null }), equity],
        /reyestr|реестр/i,
      );
    });

    it('refuses the same register asset on two lines', async () => {
      await rejects(
        [faLine(), faLine({ id: 'line-fa-2' }), { ...equity, amount: 1200000 }],
        /bir marta|один раз/i,
      );
    });

    it('refuses an asset already opened by another posted opening-balance document', async () => {
      prisma.openingBalanceLine.findFirst.mockResolvedValue({
        id: 'other-line',
        fixedAssetId: 'fa-1',
        document: { docNumber: 'OB-OLD' },
      });
      await rejects([faLine(), equity], /OB-OLD/);
      expect(prisma.openingBalanceLine.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            fixedAssetId: { in: ['fa-1'] },
            documentId: { not: 'doc-fa' },
            document: { status: OpeningBalanceStatus.POSTED },
          }),
        }),
      );
    });

    it('refuses values that differ from the register (the register is the source of truth)', async () => {
      await rejects(
        [
          faLine({ amount: 900000, netAmount: 500000 }),
          { ...equity, amount: 500000 },
        ],
        /reyestr|реестр/i,
      );
      await rejects(
        [
          faLine({ accumulatedDepreciation: 300000, netAmount: 700000 }),
          { ...equity, amount: 700000 },
        ],
        /reyestr|реестр/i,
      );
    });

    it('refuses a fixed-asset line in a currency other than UZS (the register is kept in UZS)', async () => {
      await rejects(
        [faLine({ currency: 'USD', exchangeRate: 12500 }), equity],
        /UZS/,
      );
    });

    it('looks the assets up within the tenant and posts a matching line', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue(
        docWith([faLine(), equity]),
      );
      await service.post('tenant-1', 'user-1', 'doc-fa');
      expect(prisma.fixedAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', id: { in: ['fa-1'] } },
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
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

      await expect(
        service.unpost('tenant-1', 'user-1', 'doc-posted'),
      ).rejects.toThrow(BadRequestException);
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
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc-cash',
        balance: 10000000,
      });

      await expect(
        service.unpost('tenant-1', 'user-1', 'doc-posted-cash'),
      ).rejects.toThrow(BadRequestException);
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
            id: 'line-inventory',
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
      prisma.cashAccount.findFirst.mockResolvedValue({
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
        where: { tenantId: 'tenant-1', id: 'acc-cash' },
        data: { balance: { decrement: 25000000 } },
      });
      // Stock decremented
      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: expect.anything(),
        data: { quantity: { decrement: 100 } },
      });
      // Exactly the line's batch is deleted (not a batch-number prefix match)
      expect(prisma.productBatch.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', openingBalanceLineId: 'line-inventory' },
      });
      expect(prisma.productBatch.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: { in: ['batch-intact'] } },
      });
      expect(prisma.journalEntry.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          sourceDocType: 'OpeningBalanceDocument',
        }),
      });
      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: 'tenant-1',
          counterpartyId: 'cust-1',
          currency: 'USD',
          side: CounterpartySettlementSide.CUSTOMER,
          amount: -10000000,
          entryType: 'OPENING_BALANCE_UNPOSTED',
          sourceDocType: 'OpeningBalanceLine',
          sourceDocId: 'line-customer',
        }),
      );
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
      const valid = await service.checkCutoffDate(
        'tenant-1',
        new Date('2026-10-05'),
      );
      expect(valid).toBe(true);
    });
  });
});
