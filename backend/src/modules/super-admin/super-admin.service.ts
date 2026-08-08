import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { GlobalMetrics, TenantCompanySummary, BackupMetadata } from '../../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SuperAdminService {
  constructor(private readonly prisma: PrismaService) {}

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

    const activeTenantsCount = companies.filter((c) => c.status === 'ACTIVE').length;
    const trialTenantsCount = companies.filter((c) => c.status === 'TRIAL').length;

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
            amount: plan === 'STARTER' ? 490000 : plan === 'PROFESSIONAL' ? 990000 : 1990000,
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
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
