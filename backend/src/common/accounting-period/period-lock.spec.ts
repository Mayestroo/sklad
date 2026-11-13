import { BadRequestException } from '@nestjs/common';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  assertPeriodOpen,
  periodLabel,
  periodOf,
  PeriodLockDb,
} from './period-lock';

function fakeDb(closed: Array<{ year: number; month: number }>) {
  const locks: string[] = [];
  const findMany = jest.fn(
    (args: {
      where: { OR: Array<{ year: number; month: number }>; tenantId: string };
    }) =>
      Promise.resolve(
        closed.filter((c) =>
          args.where.OR.some((p) => p.year === c.year && p.month === c.month),
        ),
      ),
  );
  const db = {
    accountingPeriod: { findMany },
    $executeRaw: jest.fn((strings: TemplateStringsArray, key: string) => {
      locks.push(key);
      return Promise.resolve(1);
    }),
  } as unknown as PeriodLockDb;
  return { db, locks, findMany };
}

describe('periodOf (UTC calendar month)', () => {
  it.each([
    ['2026-10-31', '2026-10'],
    ['2026-10-31T23:59:59.999Z', '2026-10'],
    ['2026-11-01T00:00:00.000Z', '2026-11'],
    ['2026-01-01', '2026-01'],
  ])('%s -> %s', (input, expected) => {
    expect(periodLabel(periodOf(input))).toBe(expected);
  });

  it('rejects an invalid date instead of guessing one (ADR 0022)', () => {
    expect(() => periodOf('not a date')).toThrow(BadRequestException);
  });
});

describe('assertPeriodOpen', () => {
  it('passes for an open period and takes a shared lock for it', async () => {
    const { db, locks } = fakeDb([]);
    await expect(
      assertPeriodOpen(db, 't1', new Date('2026-10-15'), 'post'),
    ).resolves.toBeUndefined();
    expect(locks).toEqual(['accounting-period:t1:2026-10']);
  });

  it('rejects a date in a closed period with a clear bilingual message', async () => {
    const { db } = fakeDb([{ year: 2026, month: 10 }]);
    const error = await assertPeriodOpen(
      db,
      't1',
      new Date('2026-10-15'),
      'cancel',
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    const message = (error as BadRequestException).message;
    expect(message).toContain('2026-10 hisobot davri yopilgan');
    expect(message).toContain('Отчётный период 2026-10 закрыт');
    expect(message).toContain('bekor qilib');
  });

  it('checks every date: one closed month among several rejects', async () => {
    const { db, locks } = fakeDb([{ year: 2026, month: 9 }]);
    await expect(
      assertPeriodOpen(
        db,
        't1',
        [
          new Date('2026-11-02'),
          new Date('2026-09-30'),
          new Date('2026-11-20'),
        ],
        'unpost',
      ),
    ).rejects.toThrow('2026-09');
    // one lock per distinct period, in a stable (sorted) order
    expect(locks).toEqual([
      'accounting-period:t1:2026-09',
      'accounting-period:t1:2026-11',
    ]);
  });

  it('only looks at the given tenant', async () => {
    const { db, findMany } = fakeDb([]);
    await assertPeriodOpen(db, 'tenant-a', new Date('2026-10-15'), 'post');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          status: 'CLOSED',
        }),
      }),
    );
  });

  it('requires a tenant', async () => {
    const { db } = fakeDb([]);
    await expect(
      assertPeriodOpen(db, '', new Date('2026-10-15'), 'post'),
    ).rejects.toThrow(BadRequestException);
  });
});

// ─── Source guards ────────────────────────────────────────────────────

const SRC = join(__dirname, '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.ts') && !/\.(spec|int-spec|e2e-spec)\.ts$/.test(name)
      ? [full]
      : [];
  });
}

describe('closed-period guard coverage (source scan)', () => {
  it('only JournalService creates or deletes journal entries and lines', () => {
    const writer =
      /journal(Entry|Line)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
    const offenders = walk(SRC)
      .filter((file) => !file.endsWith(join('journal', 'journal.service.ts')))
      .filter((file) => !file.includes(`${join('prisma', '')}seed`))
      .filter((file) => !file.endsWith('seed-helper.ts'))
      .filter((file) => writer.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  /**
   * Lifecycle methods that change the books for a dated document without
   * (only) going through createJournalEntry with that document's date.
   * Each must call assertPeriodOpen or JournalService.deleteEntriesForSource.
   * Posting paths whose journal entry carries the document date are covered
   * by createJournalEntry itself; payments and inventory documents have no
   * document date (always "now", and an unfinished month cannot be closed).
   */
  const GUARDED: Array<[string, string]> = [
    ['modules/purchases/purchases.service.ts', 'async unpostReceipt('],
    ['modules/purchases/purchases.service.ts', 'async cancelReturn('],
    [
      'modules/sales/invoices/sales-invoices.service.ts',
      'async unpostInvoice(',
    ],
    ['modules/sales/invoices/sales-invoices.service.ts', 'async cancelReturn('],
    [
      'modules/purchases/additional-expenses.service.ts',
      'async cancelExpense(',
    ],
    ['modules/opening-balances/opening-balances.service.ts', 'async unpost('],
    ['modules/services/services.service.ts', 'async post('],
    ['modules/services/services.service.ts', 'async cancel('],
    ['modules/services/services.service.ts', 'async unpost('],
    [
      'modules/inventory/transfers/stock-transfers.service.ts',
      'async shipTransfer(',
    ],
    [
      'modules/inventory/transfers/stock-transfers.service.ts',
      'async receiveTransfer(',
    ],
    ['modules/production/production.service.ts', 'async complete('],
    ['modules/production/production.service.ts', 'async cancel('],
    ['modules/finance/finance.service.ts', 'async createIncome('],
    ['modules/finance/finance.service.ts', 'async createExpense('],
    ['modules/finance/finance.service.ts', 'async createTransfer('],
    [
      'modules/finance/finance.service.ts',
      'private async reversePostedTransaction(',
    ],
  ];

  function methodBody(source: string, signature: string): string {
    const start = source.indexOf(signature);
    if (start === -1) throw new Error(`not found: ${signature}`);
    const next = source
      .slice(start + signature.length)
      .search(/\n {2}(private )?async \w+\(/);
    return next === -1
      ? source.slice(start)
      : source.slice(start, start + signature.length + next);
  }

  it.each(GUARDED)('%s %s checks the accounting period', (file, signature) => {
    const body = methodBody(readFileSync(join(SRC, file), 'utf8'), signature);
    expect(body).toMatch(/assertPeriodOpen\(|deleteEntriesForSource\(/);
  });
});
