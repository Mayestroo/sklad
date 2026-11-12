import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { randomUUID } from 'crypto';
import { ServiceActType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from '../../modules/services/services.service';
import { JournalService } from '../../modules/accounting/journal/journal.service';
import { CounterpartySettlementService } from '../../modules/settlements/counterparty-settlement.service';
import { nextDocumentNumber } from './document-sequence';

/**
 * Document numbers used to be `count + 1`, so two requests creating documents at
 * the same moment read the same count and collided on @@unique([tenantId, number]).
 */
describe('document numbering under concurrency (real database)', () => {
  const prisma = new PrismaService();
  const services = new ServicesService(
    prisma,
    {} as JournalService,
    {} as CounterpartySettlementService,
  );
  let tenantId: string;
  let counterpartyId: string;

  beforeAll(async () => {
    const company = await prisma.company.create({
      data: {
        name: { uz: 'Seq test', ru: 'Seq test' },
        slug: `seq-${randomUUID()}`,
      },
    });
    tenantId = company.id;
    const counterparty = await prisma.counterparty.create({
      data: { tenantId, name: 'Seq customer' },
    });
    counterpartyId = counterparty.id;
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const createAct = () =>
    services.create(tenantId, {
      type: ServiceActType.PROVIDED,
      counterpartyId,
      currency: 'UZS',
      items: [{ serviceName: 'Montaj', quantity: 1, unitPrice: 1000 }],
    });

  it('gives every service act created in parallel a distinct number', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => createAct()),
    );

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toEqual([]);

    const numbers = results.map(
      (r) =>
        (r as PromiseFulfilledResult<{ actNumber: string }>).value.actNumber,
    );
    expect(new Set(numbers).size).toBe(25);
  }, 60000);

  it('hands out contiguous, unique numbers to 50 parallel callers', async () => {
    const numbers = await Promise.all(
      Array.from({ length: 50 }, () =>
        nextDocumentNumber(prisma, tenantId, 'PAYMENT'),
      ),
    );
    expect(new Set(numbers).size).toBe(50);
    expect([...numbers].sort()).toEqual(
      Array.from(
        { length: 50 },
        (_, i) => `PAY-${String(i + 1).padStart(6, '0')}`,
      ),
    );
  });

  it('continues after the highest number already issued by the old scheme', async () => {
    const act = await createAct();
    await prisma.serviceAct.update({
      where: { id: act.id },
      data: { actNumber: 'ACT-2020-0041' },
    });
    const in2020 = new Date('2020-06-01T12:00:00');
    expect(
      await nextDocumentNumber(prisma, tenantId, 'SERVICE_ACT', in2020),
    ).toBe('ACT-2020-0042');
  });

  it('rolls the counter back with the transaction that reserved the number', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await nextDocumentNumber(tx, tenantId, 'STOCK_TRANSFER');
        throw new Error('posting failed');
      }),
    ).rejects.toThrow('posting failed');
    expect(await nextDocumentNumber(prisma, tenantId, 'STOCK_TRANSFER')).toBe(
      'TR-000001',
    );
  });
});
