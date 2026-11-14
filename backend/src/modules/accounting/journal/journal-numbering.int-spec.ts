import { useTestDatabase } from '../../../../test/use-test-database';
useTestDatabase();

import { randomUUID } from 'crypto';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { JournalService } from './journal.service';

/**
 * Journal entries had two writers with two formats (JE-NNNNNN from
 * JournalService, JE-YYYY-NNNNN from inline copies), both numbered count()+1.
 * There is now one writer and one format: JE-<year of entryDate>-NNNNN.
 */
describe('journal entry numbering (real database)', () => {
  const prisma = new PrismaService();
  const journal = new JournalService(prisma, {} as AccountsService);
  let tenantId: string;
  let debitAccountId: string;
  let creditAccountId: string;

  beforeAll(async () => {
    const company = await prisma.company.create({
      data: {
        name: { uz: 'JE test', ru: 'JE test' },
        slug: `je-${randomUUID()}`,
      },
    });
    tenantId = company.id;
    const [debit, credit] = await Promise.all(
      ['2910', '6010'].map((code) =>
        prisma.account.create({
          data: {
            tenantId,
            code,
            name: { uz: code, ru: code },
            type: AccountType.ASSET,
          },
        }),
      ),
    );
    debitAccountId = debit.id;
    creditAccountId = credit.id;
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const post = (entryDate: Date = new Date()) =>
    journal.createJournalEntry(tenantId, {
      description: 'test',
      entryDate,
      lines: [{ debitAccountId, creditAccountId, amount: 100 }],
    });

  it('numbers parallel entries uniquely in the JE-YYYY-NNNNN format', async () => {
    const entries = await Promise.all(Array.from({ length: 20 }, () => post()));
    const numbers = entries.map((e) => e.entryNumber);
    const year = new Date().getFullYear();
    expect(new Set(numbers).size).toBe(20);
    numbers.forEach((n) =>
      expect(n).toMatch(new RegExp(`^JE-${year}-\\d{5}$`)),
    );
  });

  it('dates the entry and picks the series from the document date', async () => {
    const docDate = new Date('2025-12-31T10:00:00');
    const entry = await post(docDate);
    expect(entry.entryNumber).toBe('JE-2025-00001');
    expect(entry.entryDate).toEqual(docDate);
  });
});
