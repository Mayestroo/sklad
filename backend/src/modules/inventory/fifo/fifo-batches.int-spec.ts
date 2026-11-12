import { useTestDatabase } from '../../../../test/use-test-database';
useTestDatabase();

import { randomUUID } from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { consumeFifoBatches, restoreBatchConsumptions } from './fifo-batches';

/**
 * The shared FIFO consumer against a real database: partial and multi-batch
 * consumption, all-or-nothing failure, and concurrent consumers of one batch.
 */
describe('consumeFifoBatches (real database)', () => {
  const prisma = new PrismaService();
  let tenantId: string;
  let warehouseId: string;
  let productId: string;

  beforeAll(async () => {
    const company = await prisma.company.create({
      data: { name: { uz: 'FIFO', ru: 'FIFO' }, slug: `fifo-${randomUUID()}` },
    });
    tenantId = company.id;
    warehouseId = (
      await prisma.warehouse.create({
        data: { tenantId, name: { uz: 'W', ru: 'W' } },
      })
    ).id;
  });

  beforeEach(async () => {
    productId = (
      await prisma.product.create({
        data: {
          tenantId,
          name: { uz: 'P', ru: 'P' },
          sku: `P-${randomUUID()}`,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const addBatch = (
    remainingQty: number,
    landedCost: number,
    createdAt: string,
  ) =>
    prisma.productBatch.create({
      data: {
        tenantId,
        warehouseId,
        productId,
        batchNumber: `B-${randomUUID().slice(0, 8)}`,
        initialQty: remainingQty,
        remainingQty,
        purchasePrice: landedCost,
        landedCost,
        createdAt: new Date(createdAt),
      },
    });

  const remaining = async (id: string) =>
    Number(
      (await prisma.productBatch.findUniqueOrThrow({ where: { id } }))
        .remainingQty,
    );

  const consume = (
    quantity: number,
    db: Parameters<typeof consumeFifoBatches>[0] = prisma,
  ) => consumeFifoBatches(db, { tenantId, warehouseId, productId, quantity });

  it('consumes part of a single batch', async () => {
    const b = await addBatch(10, 100, '2026-01-01');
    const result = await consume(4);
    expect(result.totalCost).toBe(400);
    expect(await remaining(b.id)).toBe(6);
  });

  it('consumes across several batches, oldest first', async () => {
    const old = await addBatch(5, 100, '2026-01-01');
    const newer = await addBatch(10, 200, '2026-02-01');
    const result = await consume(7);
    expect(result.totalCost).toBe(900);
    expect(await remaining(old.id)).toBe(0);
    expect(await remaining(newer.id)).toBe(8);
  });

  it('fails without any partial write when stock is insufficient', async () => {
    const a = await addBatch(5, 100, '2026-01-01');
    const b = await addBatch(3, 100, '2026-02-01');
    await expect(consume(9)).rejects.toThrow();
    expect(await remaining(a.id)).toBe(5);
    expect(await remaining(b.id)).toBe(3);
  });

  it('never drives a batch negative when consumers race for it', async () => {
    const b = await addBatch(10, 100, '2026-01-01');
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        prisma.$transaction((tx) => consume(3, tx)),
      ),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    expect(succeeded).toBe(3); // 3 x 3 = 9 <= 10; a fourth would need 12
    expect(await remaining(b.id)).toBe(1);
  }, 30000);

  it('records consumption per source and restores it exactly', async () => {
    const old = await addBatch(2, 100, '2026-01-01');
    const newer = await addBatch(5, 150, '2026-02-01');
    const counterparty = await prisma.counterparty.create({
      data: { tenantId, name: 'S' },
    });
    const purchaseReturn = await prisma.purchaseReturn.create({
      data: {
        tenantId,
        returnNumber: `PRET-${randomUUID().slice(0, 8)}`,
        counterpartyId: counterparty.id,
        warehouseId,
        currency: 'UZS',
        items: {
          create: [{ productId, quantity: 4, unitPrice: 100, totalPrice: 400 }],
        },
      },
      include: { items: true },
    });
    const source = { purchaseReturnItemId: purchaseReturn.items[0].id };

    await consumeFifoBatches(prisma, {
      tenantId,
      warehouseId,
      productId,
      quantity: 4,
      source,
    });
    expect(await prisma.batchConsumption.count({ where: source })).toBe(2);

    await restoreBatchConsumptions(prisma, tenantId, source);
    expect(await remaining(old.id)).toBe(2);
    expect(await remaining(newer.id)).toBe(5);
    expect(await prisma.batchConsumption.count({ where: source })).toBe(0);
  });
});
