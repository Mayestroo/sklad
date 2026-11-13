import { AccountingReportsService } from './accounting-reports.service';
import { AccountsService } from '../accounts/accounts.service';
import { PrismaService } from '../../../common/prisma';

describe('AccountingReportsService', () => {
  // Journal lines are posted in UZS whatever the source document's currency
  // (ADR 0006), so the reports must not borrow a document's currency label.
  it('labels the trial balance and statements UZS even after USD documents', async () => {
    const prisma = {
      account: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'a-2910', code: '2910', type: 'ASSET' }]),
      },
      journalLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            debitAccountId: 'a-2910',
            creditAccountId: 'a-6010',
            amount: 1260000,
          },
        ]),
      },
      purchaseReceipt: {
        findFirst: jest.fn().mockResolvedValue({ currency: 'USD' }),
      },
      salesInvoice: {
        findFirst: jest.fn().mockResolvedValue({ currency: 'USD' }),
      },
      company: { findUnique: jest.fn().mockResolvedValue({ settings: {} }) },
    };
    const service = new AccountingReportsService(
      prisma as unknown as PrismaService,
      { ensureDefaultAccounts: jest.fn() } as unknown as AccountsService,
    );

    const osv = await service.getTrialBalance('tenant-1');
    const statements = await service.getFinancialStatements('tenant-1');

    expect(osv.currency).toBe('UZS');
    expect(osv.totalDebitTurnover).toBe(1260000);
    expect(statements.currency).toBe('UZS');
  });
});
