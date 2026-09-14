import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../../common/prisma';
import * as bcrypt from 'bcrypt';

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
      },
      userRole: {
        create: jest.fn(),
      },
      branch: {
        create: jest.fn(),
      },
      warehouse: {
        create: jest.fn(),
      },
      subscription: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-impersonated-jwt-token'),
    };
    const mockConfigService = {
      get: jest.fn((key: string, defaultVal: any) => defaultVal),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SuperAdminService>(SuperAdminService);
  });

  describe('createTenant', () => {
    const validDto = {
      name: { uz: 'Yangi Korxona MCHJ', ru: 'ООО Новое Предприятие' },
      slug: 'yangi-korxona',
      plan: 'PROFESSIONAL' as const,
      adminEmail: 'admin@yangi.uz',
      adminPassword: 'Password123!',
      adminFirstName: 'Sardor',
      adminLastName: 'Rahimov',
    };

    it('should throw ConflictException if company slug already exists', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: 'existing-id', slug: 'yangi-korxona' });

      await expect(service.createTenant(validDto)).rejects.toThrow(ConflictException);
      await expect(service.createTenant(validDto)).rejects.toThrow('Company with this slug already exists');
    });

    it('should throw ConflictException if admin email already exists', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue({ id: 'existing-user-id', email: 'admin@yangi.uz' });

      await expect(service.createTenant(validDto)).rejects.toThrow(ConflictException);
      await expect(service.createTenant(validDto)).rejects.toThrow('User with this email already exists');
    });

    it('should atomically create company, admin user, main branch, main warehouse, and subscription', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.role.findFirst.mockResolvedValue({ id: 'role-company-admin-id', slug: 'company_admin' });

      const createdCompany = {
        id: 'new-company-id',
        name: validDto.name,
        slug: validDto.slug,
        status: 'ACTIVE',
        createdAt: new Date(),
        trialEndsAt: new Date(Date.now() + 14 * 86400000),
      };

      prisma.company.create.mockResolvedValue(createdCompany);
      prisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        email: validDto.adminEmail,
        firstName: validDto.adminFirstName,
        lastName: validDto.adminLastName,
      });
      prisma.branch.create.mockResolvedValue({ id: 'new-branch-id', isMain: true });
      prisma.warehouse.create.mockResolvedValue({ id: 'new-warehouse-id' });
      prisma.subscription.create.mockResolvedValue({
        id: 'new-sub-id',
        plan: 'PROFESSIONAL',
        status: 'ACTIVE',
      });

      const result = await service.createTenant(validDto);

      expect(prisma.company.create).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.userRole.create).toHaveBeenCalledWith({
        data: { userId: 'new-user-id', roleId: 'role-company-admin-id' },
      });
      expect(prisma.branch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isMain: true, tenantId: 'new-company-id' }),
        }),
      );
      expect(prisma.warehouse.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 'new-branch-id', tenantId: 'new-company-id' }),
        }),
      );
      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ plan: 'PROFESSIONAL', tenantId: 'new-company-id' }),
        }),
      );
      expect(result.slug).toBe('yangi-korxona');
    });
  });

  describe('impersonateTenant', () => {
    it('should throw NotFoundException if company does not exist', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(
        service.impersonateTenant('super-user-1', 'non-existent-company'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.impersonateTenant('super-user-1', 'non-existent-company'),
      ).rejects.toThrow('Company not found');
    });

    it('should throw NotFoundException if company has no active users', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: 'comp-1', name: 'Test' });
      prisma.user.findMany.mockResolvedValue([]);

      await expect(
        service.impersonateTenant('super-user-1', 'comp-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.impersonateTenant('super-user-1', 'comp-1'),
      ).rejects.toThrow('No active administrator found for this tenant');
    });

    it('should generate impersonated token and write to audit log', async () => {
      const company = {
        id: 'comp-1',
        name: { uz: 'Test Korxona' },
        slug: 'test-korxona',
        status: 'ACTIVE',
        defaultLanguage: 'uz',
      };
      const adminUser = {
        id: 'tenant-admin-1',
        tenantId: 'comp-1',
        email: 'admin@test.uz',
        firstName: 'Ali',
        lastName: 'Valiyev',
        preferredLanguage: 'uz',
        userRoles: [
          {
            role: {
              slug: 'company_admin',
              rolePermissions: [{ permission: { slug: 'dashboard:view' } }],
            },
          },
        ],
      };

      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findMany.mockResolvedValue([adminUser]);

      const result = await service.impersonateTenant('super-user-1', 'comp-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'comp-1',
          userId: 'super-user-1',
          action: 'LOGIN',
        }),
      });
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.user.email).toBe('admin@test.uz');
      expect((result as any).isImpersonated).toBe(true);
    });
  });
});
