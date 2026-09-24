import { Test, TestingModule } from '@nestjs/testing';
import { CounterpartiesService } from './counterparties.service';
import { PrismaService } from '../../../common/prisma';

describe('CounterpartiesService', () => {
  let service: CounterpartiesService;

  const mockPrisma = {
    counterpartyFolder: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    counterparty: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    counterpartyBalance: { findMany: jest.fn().mockResolvedValue([]) },
    counterpartySettlementEntry: { findMany: jest.fn().mockResolvedValue([]) },
    financeTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    salesInvoice: { count: jest.fn() },
    purchaseReceipt: { count: jest.fn() },
    payment: { count: jest.fn() },
    deal: { count: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CounterpartiesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CounterpartiesService>(CounterpartiesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFolder', () => {
    it('should create a counterparty folder', async () => {
      const tenantId = 'tenant-1';
      const dto = { name: 'VIP Clients', color: '#10b981' };
      const expectedResult = { id: 'folder-1', tenantId, ...dto };

      mockPrisma.counterpartyFolder.create.mockResolvedValue(expectedResult);

      const result = await service.createFolder(tenantId, dto);
      expect(result).toEqual(expectedResult);
      expect(mockPrisma.counterpartyFolder.create).toHaveBeenCalledWith({
        data: { tenantId, name: dto.name, color: dto.color },
      });
    });
  });

  describe('findAllFolders', () => {
    it('should return folders with counts for unassigned and total counterparties', async () => {
      const tenantId = 'tenant-1';
      const mockFolders = [
        { id: 'folder-1', name: 'VIP', _count: { counterparties: 5 } },
      ];

      mockPrisma.counterpartyFolder.findMany.mockResolvedValue(mockFolders);
      mockPrisma.counterparty.count
        .mockResolvedValueOnce(3) // unassignedCount
        .mockResolvedValueOnce(8); // totalCount

      const result = await service.findAllFolders(tenantId);
      expect(result).toEqual({
        folders: mockFolders,
        unassignedCount: 3,
        totalCount: 8,
      });
    });
  });

  describe('create counterparty with folderId', () => {
    it('should create counterparty attached to folder', async () => {
      const tenantId = 'tenant-1';
      const dto = {
        name: 'Acme Corp',
        type: 'CUSTOMER' as const,
        folderId: 'folder-1',
      };
      const expectedResult = {
        id: 'cp-1',
        tenantId,
        ...dto,
        folder: { id: 'folder-1', name: 'VIP' },
        balances: [],
      };

      mockPrisma.counterparty.create.mockResolvedValue(expectedResult);

      const result = await service.create(tenantId, dto);
      expect(result).toEqual({
        id: 'cp-1',
        tenantId,
        ...dto,
        folder: { id: 'folder-1', name: 'VIP' },
        balancesByCurrency: [],
      });
      const expectedData = expect.objectContaining({
        tenantId,
        name: 'Acme Corp',
        folderId: 'folder-1',
      }) as Record<string, unknown>;
      expect(mockPrisma.counterparty.create).toHaveBeenCalledWith({
        data: expectedData,
        include: {
          folder: true,
          priceList: true,
          balances: {
            select: { currency: true, customerDebt: true, supplierDebt: true },
            orderBy: { currency: 'asc' },
          },
        },
      });
    });
  });

  describe('findAll counterparties by folderId', () => {
    it('should filter by folderId = unassigned (null)', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.counterparty.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, undefined, 'unassigned');
      const expectedWhere = expect.objectContaining({ tenantId, folderId: null }) as Record<string, unknown>;
      expect(mockPrisma.counterparty.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
        }),
      );
    });

    it('should filter by specific folderId', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.counterparty.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, undefined, 'folder-123');
      const expectedWhere = expect.objectContaining({ tenantId, folderId: 'folder-123' }) as Record<string, unknown>;
      expect(mockPrisma.counterparty.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
        }),
      );
    });
  });

  describe('deleteFolder', () => {
    it('should delete folder (counterparties folderId set to null via DB constraint)', async () => {
      const tenantId = 'tenant-1';
      const folderId = 'folder-1';

      mockPrisma.counterpartyFolder.findFirst.mockResolvedValue({
        id: folderId,
        tenantId,
      });
      mockPrisma.counterpartyFolder.delete.mockResolvedValue({ id: folderId });

      const result = await service.deleteFolder(tenantId, folderId);
      expect(result).toEqual({ id: folderId });
      expect(mockPrisma.counterpartyFolder.delete).toHaveBeenCalledWith({
        where: { id: folderId },
      });
    });
  });

  describe('getSummary', () => {
    it('aggregates receivables and payables per currency without combining currencies', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.counterparty.count
        .mockResolvedValueOnce(3) // total_customers
        .mockResolvedValueOnce(2); // total_suppliers
      mockPrisma.counterpartyBalance.findMany.mockResolvedValueOnce([
        { counterpartyId: '1', currency: 'UZS', customerDebt: 12500000, supplierDebt: 0 },
        { counterpartyId: '2', currency: 'UZS', customerDebt: 0, supplierDebt: 4779040 },
        { counterpartyId: '3', currency: 'USD', customerDebt: 0, supplierDebt: 220960 },
      ]);

      const result = await service.getSummary(tenantId);

      expect(result).toEqual({
        total_customers: 3,
        total_suppliers: 2,
        receivables: {
          count: 1,
          total_amount: 12500000,
          byCurrency: [{ currency: 'UZS', amount: 12500000 }],
        },
        payables: {
          count: 2,
          total_amount: 0,
          byCurrency: [
            { currency: 'UZS', amount: 4779040 },
            { currency: 'USD', amount: 220960 },
          ],
        },
        customerAdvancesByCurrency: [],
        supplierAdvancesByCurrency: [],
      });
    });

    it('keeps advances separate from receivables and payables', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.counterparty.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);

      mockPrisma.counterpartyBalance.findMany.mockResolvedValueOnce([
        { counterpartyId: '1', currency: 'USD', customerDebt: 8000000, supplierDebt: 5000000 },
        { counterpartyId: '2', currency: 'USD', customerDebt: -2000000, supplierDebt: 0 },
        { counterpartyId: '3', currency: 'USD', customerDebt: 0, supplierDebt: -1000000 },
      ]);

      const result = await service.getSummary(tenantId);

      expect(result.total_customers).toBe(5);
      expect(result.total_suppliers).toBe(3);
      expect(result.receivables).toMatchObject({ count: 1, total_amount: 8000000 });
      expect(result.payables).toMatchObject({ count: 1, total_amount: 5000000 });
      expect(result.customerAdvancesByCurrency).toEqual([{ currency: 'USD', amount: 2000000 }]);
      expect(result.supplierAdvancesByCurrency).toEqual([{ currency: 'USD', amount: 1000000 }]);
    });
  });

  describe('findAll with balanceFilter', () => {
    it('should filter by balanceFilter = receivables', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.counterparty.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, undefined, undefined, undefined, undefined, 'receivables');

      expect(mockPrisma.counterparty.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            balances: { some: { OR: [{ customerDebt: { gt: 0 } }, { supplierDebt: { lt: 0 } }] } },
          }),
        }),
      );
    });

    it('should filter by balanceFilter = payables', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.counterparty.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, undefined, undefined, undefined, undefined, 'payables');

      expect(mockPrisma.counterparty.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            balances: { some: { OR: [{ supplierDebt: { gt: 0 } }, { customerDebt: { lt: 0 } }] } },
          }),
        }),
      );
    });

    it('should filter by balanceFilter = settled', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.counterparty.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, undefined, undefined, undefined, undefined, 'settled');

      expect(mockPrisma.counterparty.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            balances: { none: { OR: [{ customerDebt: { not: 0 } }, { supplierDebt: { not: 0 } }] } },
          }),
        }),
      );
    });

    it('returns gross side positions and net balance for each currency', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.counterparty.findMany.mockResolvedValue([
        { id: '1', type: 'CUSTOMER', balances: [{ currency: 'UZS', customerDebt: 10000000, supplierDebt: 0 }] },
        { id: '2', type: 'SUPPLIER', balances: [{ currency: 'USD', customerDebt: 0, supplierDebt: 4500000 }] },
        { id: '3', type: 'BOTH', balances: [{ currency: 'USD', customerDebt: 8000000, supplierDebt: 5000000 }] },
        { id: '4', type: 'CUSTOMER', balances: [{ currency: 'UZS', customerDebt: -1500000, supplierDebt: 0 }] },
      ]);

      const list = await service.findAll(tenantId);
      expect(list.map((item) => item.balancesByCurrency[0])).toEqual([
        { currency: 'UZS', customerDebt: 10000000, supplierDebt: 0, netBalance: 10000000 },
        { currency: 'USD', customerDebt: 0, supplierDebt: 4500000, netBalance: -4500000 },
        { currency: 'USD', customerDebt: 8000000, supplierDebt: 5000000, netBalance: 3000000 },
        { currency: 'UZS', customerDebt: -1500000, supplierDebt: 0, netBalance: -1500000 },
      ]);
      expect(list[0]).not.toHaveProperty('debtBalance');
    });
  });

  describe('delete', () => {
    it('should delete counterparty when no relations and debt is zero', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';
      mockPrisma.counterparty.findFirst.mockResolvedValue({
        id,
        tenantId,
      });
      mockPrisma.counterpartyBalance.findMany.mockResolvedValue([]);
      mockPrisma.salesInvoice.count.mockResolvedValue(0);
      mockPrisma.purchaseReceipt.count.mockResolvedValue(0);
      mockPrisma.payment.count.mockResolvedValue(0);
      mockPrisma.deal.count.mockResolvedValue(0);
      mockPrisma.counterparty.delete.mockResolvedValue({ id });

      const result = await service.delete(tenantId, id);
      expect(result.success).toBe(true);
      expect(mockPrisma.counterparty.delete).toHaveBeenCalledWith({ where: { id } });
    });

    it('blocks deletion when a currency projection has a nonzero customer position', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';
      mockPrisma.counterparty.findFirst.mockResolvedValue({ id, tenantId });
      mockPrisma.counterpartyBalance.findMany.mockResolvedValueOnce([
        { customerDebt: 150000, supplierDebt: 0 },
      ]);

      await expect(service.delete(tenantId, id)).rejects.toThrow();
    });

    it('does not delete a counterparty with an unreconciled legacy scalar balance', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-legacy';
      mockPrisma.counterparty.findFirst.mockResolvedValue({ id, tenantId, debtBalance: 125 });
      mockPrisma.counterpartyBalance.findMany.mockResolvedValueOnce([]);

      await expect(service.delete(tenantId, id)).rejects.toThrow();
    });

    it('blocks deletion when a currency projection has customerDebt', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';
      mockPrisma.counterparty.findFirst.mockResolvedValue({ id, tenantId });
      mockPrisma.counterpartyBalance.findMany.mockResolvedValueOnce([
        { customerDebt: 250000, supplierDebt: 0 },
      ]);

      await expect(service.delete(tenantId, id)).rejects.toThrow();
    });

    it('blocks deletion when a currency projection has supplierDebt', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';
      mockPrisma.counterparty.findFirst.mockResolvedValue({ id, tenantId });
      mockPrisma.counterpartyBalance.findMany.mockResolvedValueOnce([
        { customerDebt: 0, supplierDebt: 350000 },
      ]);

      await expect(service.delete(tenantId, id)).rejects.toThrow();
    });

    it('should throw BadRequestException if counterparty has linked invoices', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';
      mockPrisma.counterparty.findFirst.mockResolvedValue({
        id,
        tenantId,
      });
      mockPrisma.counterpartyBalance.findMany.mockResolvedValueOnce([]);
      mockPrisma.salesInvoice.count.mockResolvedValue(2);

      await expect(service.delete(tenantId, id)).rejects.toThrow();
    });
  });

  describe('getStatement', () => {
    it('returns a ledger statement with currency-specific counterparty positions', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';

      mockPrisma.counterparty.findFirst.mockResolvedValue({
        id,
        tenantId,
        name: 'Test Partner',
        type: 'BOTH',
        inn: '123456789',
        folder: null,
        priceList: null,
        balances: [{ currency: 'UZS', customerDebt: 10000000, supplierDebt: 4000000 }],
      });
      mockPrisma.counterpartySettlementEntry.findMany.mockResolvedValue([
        {
          id: 'entry-payment',
          effectiveAt: new Date('2026-09-03'),
          sourceDocType: 'FinanceTransaction',
          sourceDocId: 'tx-1',
          entryType: 'FINANCE_SETTLEMENT',
          side: 'CUSTOMER',
          amount: -2000000,
          currency: 'UZS',
        },
        {
          id: 'entry-receipt',
          effectiveAt: new Date('2026-09-02'),
          sourceDocType: 'PurchaseReceipt',
          sourceDocId: 'rec-1',
          entryType: 'PURCHASE_RECEIPT_POSTED',
          side: 'SUPPLIER',
          amount: 4000000,
          currency: 'UZS',
        },
        {
          id: 'entry-invoice',
          effectiveAt: new Date('2026-09-01'),
          sourceDocType: 'SalesInvoice',
          sourceDocId: 'inv-1',
          entryType: 'SALES_INVOICE_POSTED',
          side: 'CUSTOMER',
          amount: 10000000,
          currency: 'UZS',
        },
      ]);
      mockPrisma.financeTransaction.findMany.mockResolvedValue([
        { id: 'tx-1', docNumber: 'TX-001', direction: 'INCOME', comment: 'Partial payment' },
      ]);

      const res = await service.getStatement(tenantId, id);

      expect(res.counterparty.id).toBe(id);
      expect(res.counterparty.balancesByCurrency).toEqual([
        { currency: 'UZS', customerDebt: 10000000, supplierDebt: 4000000, netBalance: 6000000 },
      ]);
      expect(res.summary.totalSalesInvoiced).toBe(10000000);
      expect(res.summary.totalPurchasesInvoiced).toBe(4000000);
      expect(res.transactions.length).toBe(3);
      // Newest first: 2026-09-03 (tx), 2026-09-02 (rec), 2026-09-01 (inv)
      expect(res.transactions[0].type).toBe('PAYMENT_INCOME');
      expect(res.transactions[0].credit).toBe(2000000);
      expect(res.transactions[1].type).toBe('PURCHASE_RECEIPT');
      expect(res.transactions[2].type).toBe('SALES_INVOICE');
    });
  });
});
