import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { PrismaService } from './prisma.service';

/**
 * Posting a document runs FIFO, settlement and journal writes in one interactive
 * transaction. Against a remote database (Neon) that routinely exceeds Prisma's
 * 5 s default, which rolled back a real receipt posting.
 */
describe('PrismaService interactive transactions', () => {
  const prisma = new PrismaService();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns Decimal columns that serialize to JSON numbers', async () => {
    const rows = await prisma.$queryRaw<
      { amount: unknown }[]
    >`SELECT 150000.50::numeric(15,2) AS amount`;
    expect(JSON.parse(JSON.stringify(rows[0]))).toEqual({ amount: 150000.5 });
  });

  it('commits a transaction that runs longer than the 5 s Prisma default', async () => {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_sleep(6)`;
      return 'committed';
    });
    expect(result).toBe('committed');
  }, 20000);
});
