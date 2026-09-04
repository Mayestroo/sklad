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
      count: jest.fn(),
    },
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
              { type: { in: ['CUSTOMER', 'BOTH'] }, debtBalance: { gt: 0 } },
              { type: 'SUPPLIER', debtBalance: { lt: 0 } },
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
              { type: 'SUPPLIER', debtBalance: { gt: 0 } },
              { type: { in: ['CUSTOMER', 'BOTH'] }, debtBalance: { lt: 0 } },
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
            debtBalance: 0,
          }),
        }),
      );
    });
  });
});

