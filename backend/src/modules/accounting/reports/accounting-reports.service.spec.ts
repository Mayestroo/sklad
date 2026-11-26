import {
  AccountingReportsService,
  cardAccountsFromSettings,
  previousPeriod,
  resolvePeriod,
  signedBalance,
} from './accounting-reports.service';
import { AccountsService } from '../accounts/accounts.service';
import { PrismaService } from '../../../common/prisma';
import { DEFAULT_CARD_ACCOUNTS } from '../../../../../shared/types/accounting';

type Line = {
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  entryDate: Date;
};

const ACCOUNTS = [
  { id: '00', code: '00', type: 'EQUITY', isTechnical: true },
  { id: '2910', code: '2910', type: 'ASSET', isTechnical: false },
  { id: '4010', code: '4010', type: 'ASSET', isTechnical: false },
  { id: '5010', code: '5010', type: 'ASSET', isTechnical: false },
  { id: '5110', code: '5110', type: 'ASSET', isTechnical: false },
  { id: '6010', code: '6010', type: 'LIABILITY', isTechnical: false },
  { id: '8710', code: '8710', type: 'EQUITY', isTechnical: false },
  { id: '9010', code: '9010', type: 'REVENUE', isTechnical: false },
  { id: '9110', code: '9110', type: 'EXPENSE', isTechnical: false },
].map((a) => ({
  ...a,
  name: { uz: `Hisob ${a.code}`, ru: `Счёт ${a.code}` },
  alias: null,
}));

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const line = (
  debit: string,
  credit: string,
  amount: number,
  date: string,
): Line => ({
  debitAccountId: debit,
  creditAccountId: credit,
  amount,
  entryDate: day(date),
});

/** In-memory journal lines with the groupBy shape the service uses. */
function fakePrisma(lines: Line[], extra: Record<string, unknown> = {}) {
  const inRange = (l: Line, where: { entry?: { entryDate?: { gte?: Date; lt?: Date } } }) => {
    const range = where.entry?.entryDate;
    if (range?.gte && l.entryDate < range.gte) return false;
    if (range?.lt && l.entryDate >= range.lt) return false;
    return true;
  };
  return {
    account: { findMany: jest.fn().mockResolvedValue(ACCOUNTS) },
    company: { findFirst: jest.fn().mockResolvedValue({ settings: {} }) },
    journalEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(lines.length),
    },
    journalLine: {
      groupBy: jest.fn(
        ({ by, where }: { by: Array<keyof Line>; where: Parameters<typeof inRange>[1] }) => {
          const groups = new Map<string, Record<string, unknown>>();
          for (const l of lines.filter((x) => inRange(x, where))) {
            const key = by.map((k) => String(l[k])).join('|');
            const row = groups.get(key) ?? {
              ...Object.fromEntries(by.map((k) => [k, l[k]])),
              _sum: { amount: 0 },
            };
            (row._sum as { amount: number }).amount += l.amount;
            groups.set(key, row);
          }
          return Promise.resolve([...groups.values()]);
        },
      ),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...extra,
  };
}

function service(prisma: ReturnType<typeof fakePrisma>) {
  return new AccountingReportsService(
    prisma as unknown as PrismaService,
    { ensureDefaultAccounts: jest.fn() } as unknown as AccountsService,
  );
}

// Opening balance (00 nets to zero), a purchase, a sale with COGS, a customer
// payment, a cash → bank transfer, and a sale that was cancelled by storno.
const BOOKS = [
  line('5010', '00', 1000, '2026-10-01'),
  line('00', '8710', 1000, '2026-10-01'),
  line('2910', '6010', 600, '2026-11-02'),
  line('4010', '9010', 500, '2026-11-05'),
  line('9110', '2910', 300, '2026-11-05'),
  line('5010', '4010', 500, '2026-11-06'),
  line('5110', '5010', 200, '2026-11-07'),
  line('4010', '9010', 999, '2026-11-08'),
  line('9010', '4010', 999, '2026-11-08'), // storno of the line above
];

describe('AccountingReportsService', () => {
  it('signs balances by account type', () => {
    expect(signedBalance('ASSET', 100, 30)).toBe(70);
    expect(signedBalance('EXPENSE', 100, 30)).toBe(70);
    expect(signedBalance('LIABILITY', 100, 30)).toBe(-70);
    expect(signedBalance('REVENUE', 30, 100)).toBe(70);
  });

  it('resolves and compares periods', () => {
    expect(resolvePeriod(undefined, '2026-11-30')).toEqual({ from: null, to: '2026-11-30' });
    expect(() => resolvePeriod('2026-12-01', '2026-11-01')).toThrow();
    expect(() => resolvePeriod('01.11.2026')).toThrow();
    expect(previousPeriod({ from: '2026-11-01', to: '2026-11-30' })).toEqual({
      from: '2026-10-02',
      to: '2026-10-31',
    });
  });

  it('reads the card mapping from settings, defaults for the rest', () => {
    expect(cardAccountsFromSettings(null)).toEqual(DEFAULT_CARD_ACCOUNTS);
    expect(
      cardAccountsFromSettings({ accounting: { cardAccounts: { money: ['5010'], payables: 'x' } } }),
    ).toEqual({ ...DEFAULT_CARD_ACCOUNTS, money: ['5010'] });
  });

  it('builds the trial balance for a period: opening, turnover, closing', async () => {
    const tb = await service(fakePrisma(BOOKS)).getTrialBalance('t', '2026-11-01', '2026-11-30');
    const row = (code: string) => tb.items.find((i) => i.accountCode === code)!;

    expect(tb.currency).toBe('UZS');
    expect(row('5010')).toMatchObject({ openingBalance: 1000, debitTurnover: 500, creditTurnover: 200, closingBalance: 1300 });
    // the cancelled sale and its storno net out of the balance
    expect(row('4010').closingBalance).toBe(0);
    expect(row('9010').closingBalance).toBe(500);
    expect(row('00')).toMatchObject({ isTechnical: true, openingBalance: 0, closingBalance: 0 });
    expect(tb.totalDebitTurnover).toBe(tb.totalCreditTurnover);
  });

  it('reports profit, a balanced balance sheet and the cash flow', async () => {
    const svc = service(fakePrisma(BOOKS));
    const pnl = await svc.profitLossReport('t', '2026-11-01', '2026-11-30');
    expect(pnl).toMatchObject({ totalRevenue: 500, totalExpenses: 300, netProfit: 200 });

    const balance = await svc.balanceReport('t', '2026-11-30');
    expect(balance.totalAssets).toBe(1300 + 200 + 300); // cash, bank, stock
    expect(balance.totalLiabilities).toBe(600);
    expect(balance.isBalanced).toBe(true);
    expect(balance.assets.map((a) => a.code)).not.toContain('00');

    const cash = await svc.cashFlowReport('t', '2026-11-01', '2026-11-30');
    // the cash → bank transfer is neither in nor out
    expect(cash).toMatchObject({ opening: 1000, inflow: 500, outflow: 0, closing: 1500 });
  });

  it('builds the six summary cards without the technical account', async () => {
    const summary = await service(fakePrisma(BOOKS)).getSummary(
      't',
      '2026-11-01',
      '2026-11-30',
      day('2026-11-26'),
    );
    expect(summary.cards.money).toMatchObject({ value: 1500, previous: 1000 });
    expect(summary.cards.receivables.value).toBe(0);
    expect(summary.cards.payables.value).toBe(600);
    expect(summary.cards.inventory.value).toBe(300);
    expect(summary.cards.profit).toMatchObject({ value: 200, revenue: 500, expenses: 300 });
    expect(summary.cards.netWorth.value).toBe(1500 + 300 - 600);
    expect(summary.health.ok).toBe(true);
  });

  it('flags a money account below zero', async () => {
    const prisma = fakePrisma([line('6010', '5010', 50, '2026-11-01')]);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    const health = await service(prisma).getHealth('t');
    expect(health.ok).toBe(false);
    expect(health.issues).toEqual([
      expect.objectContaining({ code: 'NEGATIVE_CASH', severity: 'error', params: expect.objectContaining({ code: '5010', balance: -50 }) }),
    ]);
  });
});
