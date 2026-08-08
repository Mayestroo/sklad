import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { AuditAction } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logAction(params: {
    tenantId: string;
    userId?: string;
    entityType: string;
    entityId: string;
    action: AuditAction;
    oldValue?: any;
    newValue?: any;
    ipAddress?: string;
  }) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          entityType: params.entityType,
          entityId: params.entityId,
          action: params.action,
          oldValue: params.oldValue ? (params.oldValue as any) : undefined,
          newValue: params.newValue ? (params.newValue as any) : undefined,
          ipAddress: params.ipAddress,
        },
      });
    } catch (error) {
      // Don't crash main request if audit log write fails
      console.error('⚠️ Audit log creation failed:', error);
    }
  }

  async findByTenant(tenantId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { tenantId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
