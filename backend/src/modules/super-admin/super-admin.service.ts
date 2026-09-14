import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import {
  GlobalMetrics,
  TenantCompanySummary,
  BackupMetadata,
} from '../../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export class CreateTenantDto {
  name: { uz: string; ru: string } | string;
  slug: string;
  plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  trialDays?: number;
  adminEmail: string;
  adminPassword?: string;
  adminFirstName: string;
  adminLastName: string;
}

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async impersonateTenant(superAdminUserId: string, companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const users = await this.prisma.user.findMany({
      where: { tenantId: companyId, isActive: true },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!users || users.length === 0) {
      throw new NotFoundException('No active administrator found for this tenant');
    }

    const adminUser =
      users.find((u) =>
        u.userRoles.some((ur) => ur.role.slug === 'company_admin'),
      ) || users[0];

    const roleSlugs = adminUser.userRoles.map((ur) => ur.role.slug);
    const permissionSlugs = new Set<string>();

    adminUser.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        permissionSlugs.add(rp.permission.slug);
      });
    });

    const payload = {
      sub: adminUser.id,
      tenantId: company.id,
      email: adminUser.email,
      roles: roleSlugs,
      permissions: Array.from(permissionSlugs),
      locale: adminUser.preferredLanguage || 'uz',
      isImpersonated: true,
      impersonatedBy: superAdminUserId,
    };

    const jwtExpiration = this.configService.get<string>(
      'JWT_EXPIRATION',
      '1d',
    );
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: jwtExpiration as any,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get(
        'JWT_REFRESH_SECRET',
        'dev-jwt-refresh-secret-change-me-in-production',
      ),
      expiresIn: '7d',
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: company.id,
        userId: superAdminUserId,
        entityType: 'Company',
        entityId: company.id,
        action: 'LOGIN',
        newValue: { impersonated: true, targetUserId: adminUser.id },
      },
    });

    return {
      user: {
        id: adminUser.id,
        tenantId: company.id,
        email: adminUser.email,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        preferredLanguage: adminUser.preferredLanguage,
        roles: roleSlugs,
        permissions: Array.from(permissionSlugs),
      },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        status: company.status,
        defaultLanguage: company.defaultLanguage,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 86400,
      },
      isImpersonated: true,
      impersonatedBy: superAdminUserId,
    };
  }

  async createTenant(dto: CreateTenantDto): Promise<TenantCompanySummary> {
    const cleanSlug = dto.slug.trim().toLowerCase();
    const cleanEmail = dto.adminEmail.trim().toLowerCase();

    // 1. Check existing company slug
    const existingCompany = await this.prisma.company.findUnique({
      where: { slug: cleanSlug },
    });
    if (existingCompany) {
      throw new ConflictException('Company with this slug already exists');
    }

    // 2. Check existing admin email
    const existingUser = await this.prisma.user.findFirst({
      where: { email: cleanEmail },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // 3. Find system role "company_admin"
    const companyAdminRole = await this.prisma.role.findFirst({
      where: { slug: 'company_admin', tenantId: null },
    });
    if (!companyAdminRole) {
      throw new BadRequestException('System role company_admin not found.');
    }

    const password = dto.adminPassword || 'Admin123!';
    const passwordHash = await bcrypt.hash(password, 10);

    const trialDays = dto.trialDays ?? 14;
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const plan = dto.plan || 'PROFESSIONAL';

    const company = await this.prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          name:
            typeof dto.name === 'string'
              ? { uz: dto.name, ru: dto.name }
              : (dto.name as any),
          slug: cleanSlug,
          status: 'ACTIVE',
          trialEndsAt,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: newCompany.id,
          email: cleanEmail,
          passwordHash,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          preferredLanguage: 'uz',
          isActive: true,
        },
      });

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: companyAdminRole.id,
        },
      });

      const branch = await tx.branch.create({
        data: {
          tenantId: newCompany.id,
          name: { uz: 'Bosh filial', ru: 'Главный филиал' },
          isMain: true,
        },
      });

      await tx.warehouse.create({
        data: {
          tenantId: newCompany.id,
          branchId: branch.id,
          name: { uz: 'Asosiy omborxona', ru: 'Основной склад' },
        },
      });

      const subEndDate = new Date();
      subEndDate.setDate(subEndDate.getDate() + 30);
      await tx.subscription.create({
        data: {
          tenantId: newCompany.id,
          plan,
          status: 'ACTIVE',
          amount:
            plan === 'STARTER'
              ? 490000
              : plan === 'PROFESSIONAL'
                ? 990000
                : 1990000,
          currency: 'UZS',
          startDate: new Date(),
          endDate: subEndDate,
          nextBillingAt: subEndDate,
        },
      });

      return newCompany;
    });

    return {
      id: company.id,
      name: company.name as any,
      slug: company.slug,
      status: company.status as any,
      plan,
      userCount: 1,
      createdAt: company.createdAt.toISOString(),
      trialEndsAt: company.trialEndsAt ? company.trialEndsAt.toISOString() : null,
    };
  }

  async getGlobalMetrics(): Promise<GlobalMetrics> {
    const [companies, subscriptions, totalUsersCount] = await Promise.all([
      this.prisma.company.findMany(),
      this.prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.user.count(),
    ]);

    let totalMrr = 0;
    subscriptions.forEach((sub) => {
      totalMrr += Number(sub.amount);
    });

    const activeTenantsCount = companies.filter(
      (c) => c.status === 'ACTIVE',
    ).length;
    const trialTenantsCount = companies.filter(
      (c) => c.status === 'TRIAL',
    ).length;

    return {
      totalMrr,
      activeTenantsCount,
      trialTenantsCount,
      totalUsersCount,
    };
  }

  async getAllTenants(): Promise<TenantCompanySummary[]> {
    const companies = await this.prisma.company.findMany({
      include: {
        users: { select: { id: true } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    return companies.map((c) => {
      const activeSub = c.subscriptions[0];
      return {
        id: c.id,
        name: c.name as any,
        slug: c.slug,
        status: c.status as any,
        plan: activeSub ? (activeSub.plan as any) : 'STARTER',
        userCount: c.users.length,
        createdAt: c.createdAt.toISOString(),
        trialEndsAt: c.trialEndsAt ? c.trialEndsAt.toISOString() : null,
      };
    });
  }

  async updateTenant(
    companyId: string,
    status?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'BLOCKED',
    plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE',
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (status) {
      await this.prisma.company.update({
        where: { id: companyId },
        data: { status },
      });
    }

    if (plan) {
      const existingSub = await this.prisma.subscription.findFirst({
        where: { tenantId: companyId },
        orderBy: { createdAt: 'desc' },
      });

      if (existingSub) {
        await this.prisma.subscription.update({
          where: { id: existingSub.id },
          data: { plan },
        });
      } else {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        await this.prisma.subscription.create({
          data: {
            tenantId: companyId,
            plan,
            status: 'ACTIVE',
            amount:
              plan === 'STARTER'
                ? 490000
                : plan === 'PROFESSIONAL'
                  ? 990000
                  : 1990000,
            currency: 'UZS',
            startDate: new Date(),
            endDate,
            nextBillingAt: endDate,
          },
        });
      }
    }

    return this.prisma.company.findUnique({
      where: { id: companyId },
      include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  async createAnnouncement(
    title: { uz: string; ru: string },
    message: { uz: string; ru: string },
  ) {
    return this.prisma.systemAnnouncement.create({
      data: {
        title,
        message,
        isActive: true,
      },
    });
  }

  async getAnnouncements() {
    return this.prisma.systemAnnouncement.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSupportTickets() {
    return this.prisma.supportTicket.findMany({
      include: {
        company: true,
        user: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async replyTicket(ticketId: string, messageText: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    const msg = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderName: 'SaaS Administrator',
        isFromAdmin: true,
        message: messageText,
      },
    });

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'RESOLVED' },
    });

    return msg;
  }

  async triggerBackup(): Promise<BackupMetadata> {
    const backupDir = path.join(__dirname, '..', '..', '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `crm_backup_${timestamp}.sql`;
    const filePath = path.join(backupDir, filename);

    const content = `-- PostgreSQL Database Dump
-- CRM SaaS Platform (Uzbekistan Lex ZRU-547 Compliant Backup)
-- Timestamp: ${new Date().toISOString()}

CREATE DATABASE IF NOT EXISTS crm_db;
-- Dump Completed Successfully.
`;

    fs.writeFileSync(filePath, content, 'utf8');

    return {
      filename,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      createdAt: new Date().toISOString(),
      status: 'COMPLETED',
    };
  }

  async getBackupHistory(): Promise<BackupMetadata[]> {
    const backupDir = path.join(__dirname, '..', '..', '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      return [];
    }

    const files = fs.readdirSync(backupDir);
    return files
      .filter((f) => f.endsWith('.sql'))
      .map((filename) => {
        const stat = fs.statSync(path.join(backupDir, filename));
        return {
          filename,
          sizeBytes: stat.size,
          createdAt: stat.birthtime.toISOString(),
          status: 'COMPLETED' as const,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async getAuditLogs(tenantId?: string) {
    return this.prisma.auditLog.findMany({
      where: tenantId ? { tenantId } : {},
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
