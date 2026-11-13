import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountingPeriodStatus, AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma';
import {
  PeriodKey,
  periodLabel,
  periodLockKey,
} from '../../../common/accounting-period/period-lock';

export interface AccountingPeriodView {
  year: number;
  month: number;
  status: AccountingPeriodStatus;
  closedAt: Date | null;
  closedById: string | null;
  reopenedAt: Date | null;
  reopenedById: string | null;
}

/**
 * Closing and reopening monthly accounting periods (D4). The rule itself is
 * enforced by `assertPeriodOpen` (common/accounting-period/period-lock.ts).
 */
@Injectable()
export class AccountingPeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The twelve months of `year` with their status (no row = OPEN). */
  async list(tenantId: string, year: number): Promise<AccountingPeriodView[]> {
    const rows = await this.prisma.accountingPeriod.findMany({
      where: { tenantId, year },
    });
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const row = rows.find((r) => r.month === month);
      return {
        year,
        month,
        status: row?.status ?? AccountingPeriodStatus.OPEN,
        closedAt: row?.closedAt ?? null,
        closedById: row?.closedById ?? null,
        reopenedAt: row?.reopenedAt ?? null,
        reopenedById: row?.reopenedById ?? null,
      };
    });
  }

  async close(
    tenantId: string,
    userId: string,
    period: PeriodKey,
    now: Date = new Date(),
  ) {
    const label = periodLabel(period);
    const periodEnd = new Date(Date.UTC(period.year, period.month, 1));
    if (now.getTime() < periodEnd.getTime()) {
      throw new BadRequestException(
        `${label} davri hali tugamagan, uni yopib bo'lmaydi. / Период ${label} ещё не закончился, его нельзя закрыть.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockExclusive(tx, tenantId, period);
      const existing = await tx.accountingPeriod.findUnique({
        where: { tenantId_year_month: { tenantId, ...period } },
      });
      if (existing?.status === AccountingPeriodStatus.CLOSED) {
        throw new BadRequestException(
          `${label} davri allaqachon yopilgan. / Период ${label} уже закрыт.`,
        );
      }
      const closedAt = new Date();
      const row = await tx.accountingPeriod.upsert({
        where: { tenantId_year_month: { tenantId, ...period } },
        create: {
          tenantId,
          ...period,
          status: AccountingPeriodStatus.CLOSED,
          closedAt,
          closedById: userId,
        },
        update: {
          status: AccountingPeriodStatus.CLOSED,
          closedAt,
          closedById: userId,
        },
      });
      await this.audit(tx, tenantId, userId, row.id, label, 'OPEN', 'CLOSED');
      return row;
    });
  }

  async reopen(tenantId: string, userId: string, period: PeriodKey) {
    const label = periodLabel(period);
    return this.prisma.$transaction(async (tx) => {
      await this.lockExclusive(tx, tenantId, period);
      const existing = await tx.accountingPeriod.findUnique({
        where: { tenantId_year_month: { tenantId, ...period } },
      });
      if (existing?.status !== AccountingPeriodStatus.CLOSED) {
        throw new BadRequestException(
          `${label} davri yopilmagan. / Период ${label} не закрыт.`,
        );
      }
      const row = await tx.accountingPeriod.update({
        where: { id: existing.id, tenantId },
        data: {
          status: AccountingPeriodStatus.OPEN,
          reopenedAt: new Date(),
          reopenedById: userId,
        },
      });
      await this.audit(tx, tenantId, userId, row.id, label, 'CLOSED', 'OPEN');
      return row;
    });
  }

  /** Waits for postings in flight in this period, and blocks new ones. */
  private async lockExclusive(
    tx: Prisma.TransactionClient,
    tenantId: string,
    period: PeriodKey,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${periodLockKey(tenantId, period)}, 0))`;
  }

  /** Written in the same transaction: no close or reopen without its trail. */
  private async audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    periodId: string,
    label: string,
    from: AccountingPeriodStatus | 'OPEN',
    to: AccountingPeriodStatus | 'OPEN',
  ) {
    await tx.auditLog.create({
      data: {
        tenantId,
        userId,
        entityType: 'AccountingPeriod',
        entityId: periodId,
        action: AuditAction.UPDATE,
        oldValue: { period: label, status: from },
        newValue: {
          period: label,
          status: to,
          event: to === 'CLOSED' ? 'PERIOD_CLOSED' : 'PERIOD_REOPENED',
        },
      },
    });
  }
}
