import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { Pool } from 'pg';
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

/**
 * The service builds its own pg Pool for the driver adapter, and
 * $disconnect() does not end a pool the caller created: its sockets kept the
 * e2e Jest process alive after app.close() (round 4).
 */
describe('PrismaService shutdown', () => {
  it('closes its pg connections when the module is destroyed', async () => {
    const prisma = new PrismaService();
    await prisma.$queryRaw`SELECT 1`;
    const pool = (prisma as unknown as { pgPool: Pool }).pgPool;
    expect(pool.totalCount).toBeGreaterThan(0);

    await prisma.onModuleDestroy();
    await prisma.onModuleDestroy(); // a second shutdown hook call is harmless

    expect(pool.ended).toBe(true);
    expect(pool.totalCount).toBe(0);
  });
});
