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
      };

      mockPrisma.counterparty.create.mockResolvedValue(expectedResult);

      const result = await service.create(tenantId, dto);
      expect(result).toEqual(expectedResult);
      const expectedData = expect.objectContaining({
        tenantId,
        name: 'Acme Corp',
        folderId: 'folder-1',
      }) as Record<string, unknown>;
      expect(mockPrisma.counterparty.create).toHaveBeenCalledWith({
        data: expectedData,
        include: { folder: true, priceList: true },
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
    it('should aggregate customer, supplier, receivables, and payables correctly', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.counterparty.count
        .mockResolvedValueOnce(3) // total_customers
        .mockResolvedValueOnce(2); // total_suppliers

      mockPrisma.counterparty.findMany.mockResolvedValueOnce([
        { id: '1', type: 'CUSTOMER', debtBalance: 12500000 },
        { id: '2', type: 'SUPPLIER', debtBalance: 4779040 },
        { id: '3', type: 'SUPPLIER', debtBalance: 220960 },
      ]);

      const result = await service.getSummary(tenantId);

      expect(result).toEqual({
        total_customers: 3,
        total_suppliers: 2,
        receivables: {
          count: 1,
          total_amount: 12500000,
        },
        payables: {
          count: 2,
          total_amount: 5000000,
        },
      });
    });

    it('should aggregate hybrid (BOTH) counterparties and customer advances correctly', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.counterparty.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);

      mockPrisma.counterparty.findMany.mockResolvedValueOnce([
        // Hybrid partner: owes us 8m, we owe them 5m
        { id: '1', type: 'BOTH', customerDebt: 8000000, supplierDebt: 5000000, debtBalance: 3000000 },
        // Customer with advance (overpayment): owes -2m (our liability)
        { id: '2', type: 'CUSTOMER', customerDebt: -2000000, supplierDebt: 0, debtBalance: -2000000 },
        // Supplier with advance (held prepayment): supplier owes us 1m
        { id: '3', type: 'SUPPLIER', customerDebt: 0, supplierDebt: -1000000, debtBalance: -1000000 },
      ]);

      const result = await service.getSummary(tenantId);

      expect(result.total_customers).toBe(5);
      expect(result.total_suppliers).toBe(3);
      // Receivables: hybrid custDebt (8m) + supplier prepayment (1m) = 9m, count = 2
      expect(result.receivables.count).toBe(2);
      expect(result.receivables.total_amount).toBe(9000000);
      // Payables: hybrid suppDebt (5m) + customer advance (2m) = 7m, count = 2
      expect(result.payables.count).toBe(2);
      expect(result.payables.total_amount).toBe(7000000);
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
            OR: [
              { customerDebt: { gt: 0 } },
              { supplierDebt: { lt: 0 } },
              {
                AND: [
                  { customerDebt: 0 },
                  { supplierDebt: 0 },
                  {
                    OR: [
                      { type: { in: ['CUSTOMER', 'BOTH'] }, debtBalance: { gt: 0 } },
                      { type: 'SUPPLIER', debtBalance: { lt: 0 } },
                    ],
                  },
                ],
              },
            ],
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
            OR: [
              { supplierDebt: { gt: 0 } },
              { customerDebt: { lt: 0 } },
              {
                AND: [
                  { customerDebt: 0 },
                  { supplierDebt: 0 },
                  {
                    OR: [
                      { type: 'SUPPLIER', debtBalance: { gt: 0 } },
                      { type: { in: ['CUSTOMER', 'BOTH'] }, debtBalance: { lt: 0 } },
                    ],
                  },
                ],
              },
            ],
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
            AND: [
              { customerDebt: 0 },
              { supplierDebt: 0 },
              { debtBalance: 0 },
            ],
          }),
        }),
      );
    });

    it('should correctly compute netBalance for counterparties', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.counterparty.findMany.mockResolvedValue([
        { id: '1', type: 'CUSTOMER', customerDebt: 10000000, supplierDebt: 0, debtBalance: 10000000 },
        { id: '2', type: 'SUPPLIER', customerDebt: 0, supplierDebt: 4500000, debtBalance: 4500000 },
        { id: '3', type: 'BOTH', customerDebt: 8000000, supplierDebt: 5000000, debtBalance: 3000000 },
        { id: '4', type: 'CUSTOMER', customerDebt: -1500000, supplierDebt: 0, debtBalance: -1500000 },
      ]);

      const list = await service.findAll(tenantId);
      expect(list[0].netBalance).toBe(10000000); // Debitor (+)
      expect(list[1].netBalance).toBe(-4500000); // Kreditor (-)
      expect(list[2].netBalance).toBe(3000000);  // Net Debitor (+)
      expect(list[3].netBalance).toBe(-1500000); // Customer advance / liability (-)
    });
  });

  describe('delete', () => {
    it('should delete counterparty when no relations and debt is zero', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';
      mockPrisma.counterparty.findFirst.mockResolvedValue({
        id,
        tenantId,
        debtBalance: 0,
        customerDebt: 0,
        supplierDebt: 0,
      });
      mockPrisma.salesInvoice.count.mockResolvedValue(0);
      mockPrisma.purchaseReceipt.count.mockResolvedValue(0);
      mockPrisma.payment.count.mockResolvedValue(0);
      mockPrisma.deal.count.mockResolvedValue(0);
      mockPrisma.counterparty.delete.mockResolvedValue({ id });

      const result = await service.delete(tenantId, id);
      expect(result.success).toBe(true);
      expect(mockPrisma.counterparty.delete).toHaveBeenCalledWith({ where: { id } });
    });

    it('should throw BadRequestException if counterparty has debtBalance', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';
      mockPrisma.counterparty.findFirst.mockResolvedValue({ id, tenantId, debtBalance: 150000 });

      await expect(service.delete(tenantId, id)).rejects.toThrow();
    });

    it('should throw BadRequestException if counterparty has customerDebt even if debtBalance is 0', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';
      mockPrisma.counterparty.findFirst.mockResolvedValue({
        id,
        tenantId,
        debtBalance: 0,
        customerDebt: 250000,
        supplierDebt: 0,
      });

      await expect(service.delete(tenantId, id)).rejects.toThrow();
    });

    it('should throw BadRequestException if counterparty has supplierDebt even if debtBalance is 0', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';
      mockPrisma.counterparty.findFirst.mockResolvedValue({
        id,
        tenantId,
        debtBalance: 0,
        customerDebt: 0,
        supplierDebt: 350000,
      });

      await expect(service.delete(tenantId, id)).rejects.toThrow();
    });

    it('should throw BadRequestException if counterparty has linked invoices', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';
      mockPrisma.counterparty.findFirst.mockResolvedValue({
        id,
        tenantId,
        debtBalance: 0,
        customerDebt: 0,
        supplierDebt: 0,
      });
      mockPrisma.salesInvoice.count.mockResolvedValue(2);

      await expect(service.delete(tenantId, id)).rejects.toThrow();
    });
  });

  describe('getStatement', () => {
    it('should compile unified chronological statement with netBalance and transactions', async () => {
      const tenantId = 'tenant-1';
      const id = 'cp-1';

      mockPrisma.counterparty.findFirst.mockResolvedValue({
        id,
        tenantId,
        name: 'Test Partner',
        type: 'BOTH',
        inn: '123456789',
        customerDebt: 10000000,
        supplierDebt: 4000000,
        debtBalance: 6000000,
        salesInvoices: [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-001',
            invoiceDate: new Date('2026-09-01'),
            totalAmount: 10000000,
            paidAmount: 0,
            currency: 'UZS',
            status: 'POSTED',
          },
        ],
        purchaseReceipts: [
          {
            id: 'rec-1',
            docNumber: 'REC-001',
            docDate: new Date('2026-09-02'),
            totalAmount: 4000000,
            paidAmount: 0,
            currency: 'UZS',
            status: 'POSTED',
          },
        ],
        financeTransactions: [
          {
            id: 'tx-1',
            docNumber: 'TX-001',
            direction: 'INCOME',
            amount: 2000000,
            currency: 'UZS',
            createdAt: new Date('2026-09-03'),
            comment: 'Partial payment',
          },
        ],
        salesReturns: [],
        purchaseReturns: [],
      });

      const res = await service.getStatement(tenantId, id);

      expect(res.counterparty.id).toBe(id);
      expect(res.counterparty.netBalance).toBe(6000000);
      expect(res.summary.totalSalesInvoiced).toBe(10000000);
      expect(res.summary.totalPurchasesInvoiced).toBe(4000000);
      expect(res.transactions.length).toBe(3);
      // Newest first: 2026-09-03 (tx), 2026-09-02 (rec), 2026-09-01 (inv)
      expect(res.transactions[0].type).toBe('PAYMENT_INCOME');
      expect(res.transactions[1].type).toBe('PURCHASE_RECEIPT');
      expect(res.transactions[2].type).toBe('SALES_INVOICE');
    });
  });
});


