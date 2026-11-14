import { PrismaService } from '../../../common/prisma';
import { AccountsService } from '../accounts/accounts.service';
import { JournalService } from './journal.service';

jest.mock('../../../common/sequences/document-sequence');
jest.mock('../../../common/accounting-period/period-lock');

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
        paymentDate: new Date('2026-01-10T00:00:00.000Z'),
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
      paymentDate: new Date('2026-01-10T00:00:00.000Z'),
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

  it('writes the entry through the transaction client it is given, so it commits or rolls back with the business document', async () => {
    const tx = createPrismaMock();

    await service.autoPostInboundDoc(
      tenantId,
      {
        id: 'doc-1',
        docNumber: 'IN-000001',
        docDate: new Date('2026-01-10T00:00:00.000Z'),
        totalAmount: 500,
      },
      tx as never,
    );

    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  it('posts the settlement-rate loss separately from customer receivables', async () => {
    await service.autoPostPayment(tenantId, {
      id: 'payment-loss',
      paymentNumber: 'PAY-LOSS',
      paymentDate: new Date('2026-01-10T00:00:00.000Z'),
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

/**
 * F5: an automatic posting carries the source document's date, never the
 * moment it was posted (CLAUDE.md: pass the document date as entryDate).
 */
describe('JournalService entry dates', () => {
  const tenantId = 'tenant-1';
  const documentDate = new Date('2026-03-15T00:00:00.000Z');
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

  const postedEntryDate = () =>
    (
      prisma.journalEntry.create.mock.calls[0]?.[0] as {
        data: { entryDate: Date };
      }
    ).data.entryDate;

  it('refuses an automatic entry without a date instead of dating it now', async () => {
    await expect(
      service.createJournalEntry(tenantId, {
        description: 'no date',
        lines: [{ debitAccountId: 'a', creditAccountId: 'b', amount: 1 }],
      } as never),
    ).rejects.toThrow();
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  it('dates a customer payment by its payment date', async () => {
    await service.autoPostPayment(tenantId, {
      id: 'payment-1',
      paymentNumber: 'PAY-000001',
      paymentDate: documentDate,
      method: 'CASH',
      amount: 25,
      currency: 'UZS',
      exchangeRate: 1,
      invoice: { currency: 'UZS', exchangeRate: 1 },
      cashAccount: { accountType: 'UZS_CASH', currency: 'UZS' },
    });
    expect(postedEntryDate()).toEqual(documentDate);
  });

  it('dates an inbound inventory document by its document date', async () => {
    await service.autoPostInboundDoc(tenantId, {
      id: 'doc-1',
      docNumber: 'IN-000001',
      docDate: documentDate,
      totalAmount: 500,
    });
    expect(postedEntryDate()).toEqual(documentDate);
  });

  it('dates a transfer shipment by the transfer date', async () => {
    await service.autoPostShipTransfer(
      tenantId,
      {
        id: 'tr-1',
        transferNumber: 'TR-000001',
        transferDate: documentDate,
        receivedAt: null,
      },
      100,
    );
    expect(postedEntryDate()).toEqual(documentDate);
  });

  it('dates a transfer receipt by the receipt recorded on the transfer', async () => {
    const receivedAt = new Date('2026-03-18T09:00:00.000Z');
    await service.autoPostReceiveTransfer(
      tenantId,
      {
        id: 'tr-1',
        transferNumber: 'TR-000001',
        transferDate: documentDate,
        receivedAt,
      },
      100,
    );
    expect(postedEntryDate()).toEqual(receivedAt);
  });

  it('refuses a transfer receipt that has no receipt date', async () => {
    await expect(
      service.autoPostReceiveTransfer(
        tenantId,
        {
          id: 'tr-1',
          transferNumber: 'TR-000001',
          transferDate: documentDate,
          receivedAt: null,
        },
        100,
      ),
    ).rejects.toThrow();
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  it('dates a service act by the act date', async () => {
    await service.autoPostServiceAct(tenantId, {
      id: 'act-1',
      actNumber: 'ACT-000001',
      actDate: documentDate,
      type: 'PROVIDED',
      currency: 'UZS',
      exchangeRate: 1,
      subtotal: 100,
      vatAmount: 12,
    });
    expect(postedEntryDate()).toEqual(documentDate);
  });
});
