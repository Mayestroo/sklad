import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../../common/prisma';

describe('TenantsService - Settings Management', () => {
  let service: TenantsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  describe('getSettings', () => {
    it('should return default settings with enableMultiTierPriceLists=false when company has no settings', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'tenant-1',
        settings: null,
      });

      const res = await service.getSettings('tenant-1');
      expect(res.sales.enableMultiTierPriceLists).toBe(false);
      expect(res.sales.defaultCurrency).toBe('UZS');
    });

    it('should return existing stored settings', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'tenant-1',
        settings: {
          sales: {
            enableMultiTierPriceLists: true,
            allowSellerPriceOverride: true,
            defaultCurrency: 'USD',
          },
        },
      });

      const res = await service.getSettings('tenant-1');
      expect(res.sales.enableMultiTierPriceLists).toBe(true);
      expect(res.sales.allowSellerPriceOverride).toBe(true);
      expect(res.sales.defaultCurrency).toBe('USD');
    });
  });

  describe('updateSettings', () => {
    it('should merge and update settings and write to audit log', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'tenant-1',
        settings: {
          sales: { enableMultiTierPriceLists: false },
        },
      });

      prisma.company.update.mockResolvedValue({
        id: 'tenant-1',
        settings: {
          sales: { enableMultiTierPriceLists: true, allowSellerPriceOverride: false, defaultCurrency: 'UZS' },
          inventory: {},
          accounting: {},
        },
      });

      const res = await service.updateSettings(
        'tenant-1',
        { sales: { enableMultiTierPriceLists: true } },
        'user-1',
      );

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        data: {
          settings: expect.objectContaining({
            sales: expect.objectContaining({
              enableMultiTierPriceLists: true,
            }),
          }),
        },
        select: { id: true, settings: true },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          entityType: 'CompanySettings',
          action: 'UPDATE',
        }),
      });

      expect(res.sales.enableMultiTierPriceLists).toBe(true);
    });
  });
});
