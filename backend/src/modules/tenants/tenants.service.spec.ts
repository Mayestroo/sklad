import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../common/prisma';
import { UpdateCompanySettingsDto } from './dto';

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
      account: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantsService, { provide: PrismaService, useValue: prisma }],
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
          sales: {
            enableMultiTierPriceLists: true,
            allowSellerPriceOverride: false,
            defaultCurrency: 'UZS',
          },
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

      expect((res as any)?.sales?.enableMultiTierPriceLists).toBe(true);
    });
  });
  describe('D2: purchase-return gain account setting', () => {
    beforeEach(() => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'tenant-1',
        settings: {},
      });
      prisma.company.update.mockImplementation(({ data }: { data: any }) => ({
        id: 'tenant-1',
        settings: data.settings,
      }));
    });

    it('rejects a code that is not in the tenant chart of accounts', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(
        service.updateSettings('tenant-1', {
          accounting: { purchaseReturnGainAccountCode: '9999' },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.account.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', code: '9999' },
      });
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it('saves a code that exists for the tenant', async () => {
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-9390',
        code: '9390',
      });
      const saved = (await service.updateSettings('tenant-1', {
        accounting: { purchaseReturnGainAccountCode: '9390' },
      })) as { accounting: { purchaseReturnGainAccountCode: string } };
      expect(saved.accounting.purchaseReturnGainAccountCode).toBe('9390');
    });

    it('validates the code shape in the request body', async () => {
      const errors = async (code: unknown) =>
        validate(
          plainToInstance(UpdateCompanySettingsDto, {
            accounting: { purchaseReturnGainAccountCode: code },
          }),
        );
      expect(await errors('9390')).toHaveLength(0);
      expect((await errors('93a0')).length).toBeGreaterThan(0);
      expect((await errors(9390)).length).toBeGreaterThan(0);
    });
  });
});
