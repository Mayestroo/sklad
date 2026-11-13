import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Accounting period closing (D4).
 *
 * A period is a UTC calendar month of one tenant's books. While it is
 * CLOSED, nothing dated in it may change the books: no journal entry dated
 * in it is created or deleted (enforced inside JournalService, the only
 * writer), and no document dated in it is posted, unposted, cancelled or
 * deleted after posting (enforced by each lifecycle method, because some of
 * them — cash transactions, for example — change balances without a journal
 * entry).
 *
 * Concurrency: every check takes a shared transaction-scoped advisory lock
 * per period, and closing takes the exclusive one. A posting that is in
 * flight when someone closes its month therefore either commits before the
 * close or sees the period closed; it cannot slip in afterwards. Call it
 * with the document's transaction client so the lock lives as long as the
 * transaction.
 */

export type PeriodAction = 'post' | 'unpost' | 'cancel' | 'delete' | 'edit';

export interface PeriodKey {
  year: number;
  month: number;
}

export type PeriodLockDb = Pick<
  Prisma.TransactionClient,
  'accountingPeriod' | '$executeRaw'
>;

const ACTION_TEXT: Record<PeriodAction, { uz: string; ru: string }> = {
  post: { uz: 'joylashtirib (provodka qilib)', ru: 'провести' },
  unpost: { uz: 'provodkani bekor qilib', ru: 'отменить проведение' },
  cancel: { uz: 'bekor qilib', ru: 'отменить' },
  delete: { uz: "o'chirib", ru: 'удалить' },
  edit: { uz: "o'zgartirib", ru: 'изменить' },
};

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(
      `Hujjat sanasi noto'g'ri: ${String(value)} / Неверная дата документа: ${String(value)}`,
    );
  }
  return date;
}

/** The period a date belongs to (UTC calendar month). */
export function periodOf(value: Date | string): PeriodKey {
  const date = toDate(value);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function periodLabel({ year, month }: PeriodKey): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** The advisory-lock key of one tenant period (shared with closing). */
export function periodLockKey(tenantId: string, period: PeriodKey): string {
  return `accounting-period:${tenantId}:${periodLabel(period)}`;
}

function uniquePeriods(dates: Array<Date | string>): PeriodKey[] {
  const seen = new Map<string, PeriodKey>();
  for (const value of dates) {
    const period = periodOf(value);
    seen.set(periodLabel(period), period);
  }
  return [...seen.values()].sort((a, b) =>
    periodLabel(a).localeCompare(periodLabel(b)),
  );
}

export function closedPeriodError(
  period: PeriodKey,
  action: PeriodAction,
): BadRequestException {
  const label = periodLabel(period);
  const text = ACTION_TEXT[action];
  return new BadRequestException(
    `${label} hisobot davri yopilgan: bu davr sanasidagi hujjat yoki yozuvni ${text.uz} bo'lmaydi. ` +
      `Avval davrni qayta oching. / Отчётный период ${label} закрыт: документ или запись с датой в этом периоде нельзя ${text.ru}. ` +
      `Сначала откройте период повторно.`,
  );
}

/**
 * Rejects the action when any of `dates` falls in a CLOSED period of the
 * tenant. Pass every date the action touches (the document date, and for a
 * reversal the dates of the entries it removes).
 */
export async function assertPeriodOpen(
  db: PeriodLockDb,
  tenantId: string,
  dates: Date | string | Array<Date | string>,
  action: PeriodAction,
): Promise<void> {
  if (!tenantId) {
    throw new BadRequestException('tenantId is required');
  }
  const periods = uniquePeriods(Array.isArray(dates) ? dates : [dates]);
  if (periods.length === 0) return;

  // Sorted order keeps lock acquisition consistent across callers.
  for (const period of periods) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${periodLockKey(tenantId, period)}, 0))`;
  }

  const closed = await db.accountingPeriod.findMany({
    where: {
      tenantId,
      status: 'CLOSED',
      OR: periods.map(({ year, month }) => ({ year, month })),
    },
    select: { year: true, month: true },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });
  if (closed.length > 0) {
    throw closedPeriodError(closed[0], action);
  }
}
