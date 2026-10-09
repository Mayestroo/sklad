import { PrismaService } from '../../../common/prisma';
import { AccountsService } from '../accounts/accounts.service';
import { JournalService } from './journal.service';

const cashAccountLedgerCases: Array<[string, string, string, number]> = [
  ['UZS_CASH', 'UZS', '5010', 25],
  ['USD_CASH', 'USD', '5020', 320000],
  ['BANK', 'UZS', '5110', 25],
  ['BANK', 'USD', '5210', 320000],
];

function createPrismaMock() {
  return {
    account: {
      count: jest.fn<Promise<number>, []>(() => Promise.resolve(16)),
      findFirst: jest.fn<
        Promise<{ id: string; code: string }>,
        [{ where: { code: string } }]
      >(({ where }) =>
        Promise.resolve({ id: `account-${where.code}`, code: where.code }),
      ),
    },
    journalEntry: {
      count: jest.fn<Promise<number>, []>(() => Promise.resolve(0)),
      create: jest.fn<Promise<{ id: string }>, [unknown]>((args) => {
        void args;
        return Promise.resolve({ id: 'journal-1' });
      }),
    },
  };
}

describe('JournalService cash-account routing', () => {
  const tenantId = 'tenant-1';
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: JournalService;

  beforeEach(() => {
    prisma = createPrismaMock();
    const prismaService = prisma as unknown as PrismaService;
    service = new JournalService(
      prismaService,
      new AccountsService(prismaService),
    );
  });

  it.each(cashAccountLedgerCases)(
    'posts %s/%s receipts to its dedicated ledger account %s',
    async (accountType, currency, ledgerCode, ledgerAmount) => {
      await service.autoPostPayment(tenantId, {
        id: 'payment-1',
        paymentNumber: 'PAY-000001',
        method: 'CASH',
        amount: 25,
        currency,
        exchangeRate: currency === 'USD' ? 12800 : 1,
        invoice: { currency, exchangeRate: currency === 'USD' ? 12800 : 1 },
        cashAccount: {
          accountType: accountType as 'UZS_CASH' | 'USD_CASH' | 'BANK',
          currency,
        },
      });

      const createArgs = prisma.journalEntry.create.mock.calls[0]?.[0] as {
        data: {
          lines: {
            create: Array<{
              debitAccountId: string;
              creditAccountId: string;
              amount: number;
            }>;
          };
        };
      };
      expect(createArgs.data.lines.create[0]).toMatchObject({
        debitAccountId: `account-${ledgerCode}`,
        creditAccountId: 'account-4010',
        amount: ledgerAmount,
      });
    },
  );

  it('posts the settlement-rate gain separately from customer receivables', async () => {
    await service.autoPostPayment(tenantId, {
      id: 'payment-gain',
      paymentNumber: 'PAY-GAIN',
      method: 'CASH',
      amount: 100,
      currency: 'USD',
      exchangeRate: 13000,
      invoice: { currency: 'USD', exchangeRate: 12000 },
      cashAccount: { accountType: 'USD_CASH', currency: 'USD' },
    });

    const args = prisma.journalEntry.create.mock.calls[0]?.[0] as {
      data: { lines: { create: Array<Record<string, unknown>> } };
    };
    expect(args.data.lines.create).toEqual([
      expect.objectContaining({
        debitAccountId: 'account-5020',
        creditAccountId: 'account-4010',
        amount: 1200000,
      }),
      expect.objectContaining({
        debitAccountId: 'account-5020',
        creditAccountId: 'account-9540',
        amount: 100000,
      }),
    ]);
  });

  it('posts the settlement-rate loss separately from customer receivables', async () => {
    await service.autoPostPayment(tenantId, {
      id: 'payment-loss',
      paymentNumber: 'PAY-LOSS',
      method: 'BANK_TRANSFER',
      amount: 100,
      currency: 'USD',
      exchangeRate: 11000,
      invoice: { currency: 'USD', exchangeRate: 12000 },
      cashAccount: { accountType: 'BANK', currency: 'USD' },
    });

    const args = prisma.journalEntry.create.mock.calls[0]?.[0] as {
      data: { lines: { create: Array<Record<string, unknown>> } };
    };
    expect(args.data.lines.create).toEqual([
      expect.objectContaining({
        debitAccountId: 'account-5210',
        creditAccountId: 'account-4010',
        amount: 1100000,
      }),
      expect.objectContaining({
        debitAccountId: 'account-9620',
        creditAccountId: 'account-4010',
        amount: 100000,
      }),
    ]);
  });
});
