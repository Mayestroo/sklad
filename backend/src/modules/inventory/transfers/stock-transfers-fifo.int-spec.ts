import { useTestDatabase } from '../../../../test/use-test-database';
useTestDatabase();

import { randomUUID } from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AccountsService } from '../../accounting/accounts/accounts.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { StockTransfersService } from './stock-transfers.service';

/**
 * Transfers were valued at the catalog costPrice (read again on receipt, and
 * without its currency rate) and never moved batches: the source kept stale
 * batches and the target received stock with no cost layer.
 */
describe('stock transfers move FIFO batches at batch cost (real database)', () => {
  const prisma = new PrismaService();
  const service = new StockTransfersService(
    prisma,
    { logAction: jest.fn() } as unknown as AuditService,
    new JournalService(prisma, new AccountsService(prisma)),
  );
  const userId = undefined as unknown as string;
  let tenantId: string;
  let sourceId: string;
  let targetId: string;
  let productId: string;

  beforeAll(async () => {
    tenantId = (
      await prisma.company.create({
        data: { name: { uz: 'Tr', ru: 'Tr' }, slug: `tr-${randomUUID()}` },
      })
    ).id;
    [sourceId, targetId] = (
      await Promise.all(
        ['A', 'B'].map((n) =>
          prisma.warehouse.create({
            data: { tenantId, name: { uz: n, ru: n } },
          }),
        ),
      )
    ).map((w) => w.id);
  });

  beforeEach(async () => {
    // Catalog cost deliberately differs from the batch cost (and is in USD).
    productId = (
      await prisma.product.create({
        data: {
          tenantId,
          name: { uz: 'P', ru: 'P' },
          sku: `P-${randomUUID()}`,
          costPrice: 7,
          costPriceCurrency: 'USD',
          costPriceExchangeRate: 12500,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const stockIn = async (quantity: number, cost: number, createdAt: string) => {
    await prisma.productBatch.create({
      data: {
        tenantId,
        warehouseId: sourceId,
        productId,
        batchNumber: `B-${randomUUID().slice(0, 6)}`,
        initialQty: quantity,
        remainingQty: quantity,
        purchasePrice: cost,
        landedCost: cost,
        createdAt: new Date(createdAt),
      },
    });
    await prisma.stockLevel.upsert({
      where: {
        tenantId_warehouseId_productId: {
          tenantId,
          warehouseId: sourceId,
          productId,
        },
      },
      update: { quantity: { increment: quantity } },
      create: { tenantId, warehouseId: sourceId, productId, quantity },
    });
  };

  const transfer = (quantity: number) =>
    service.createTransfer(
      tenantId,
      {
        sourceWarehouseId: sourceId,
        targetWarehouseId: targetId,
        items: [{ productId, quantity }],
      },
      userId,
    );

  const batchesIn = (warehouseId: string) =>
    prisma.productBatch.findMany({
      where: { tenantId, productId, warehouseId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

  const journalAmount = async (transferId: string, debitCode: string) => {
    const lines = await prisma.journalLine.findMany({
      where: {
        entry: {
          tenantId,
          sourceDocType: 'StockTransfer',
          sourceDocId: transferId,
        },
        debitAccount: { code: debitCode },
      },
    });
    return lines.reduce((sum, line) => sum + Number(line.amount), 0);
  };

  it('ships at batch cost and receives the same cost layers in the target', async () => {
    await stockIn(4, 1000, '2026-01-01T00:00:00Z');
    await stockIn(10, 2000, '2026-02-01T00:00:00Z');
    const tr = await transfer(6);

    await service.shipTransfer(tenantId, tr.id, userId);
    const source = await batchesIn(sourceId);
    expect(source.map((b) => Number(b.remainingQty))).toEqual([0, 8]);
    const expectedCost = 4 * 1000 + 2 * 2000; // not 6 x catalog cost
    expect(await journalAmount(tr.id, '2920')).toBe(expectedCost);

    await service.receiveTransfer(tenantId, tr.id, userId);
    const target = await batchesIn(targetId);
    expect(
      target.map((b) => [Number(b.remainingQty), Number(b.landedCost)]),
    ).toEqual([
      [4, 1000],
      [2, 2000],
    ]);
    // FIFO age travels with the goods.
    expect(target[0].createdAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    // In-transit (2920) nets to zero.
    expect(await journalAmount(tr.id, '2910')).toBe(expectedCost);
  });

  it('refuses to ship more than the batches hold, without writing anything', async () => {
    await stockIn(3, 1000, '2026-01-01T00:00:00Z');
    await prisma.stockLevel.update({
      where: {
        tenantId_warehouseId_productId: {
          tenantId,
          warehouseId: sourceId,
          productId,
        },
      },
      data: { quantity: 5 },
    });
    const tr = await transfer(4);

    await expect(
      service.shipTransfer(tenantId, tr.id, userId),
    ).rejects.toThrow();

    expect(
      (await batchesIn(sourceId)).map((b) => Number(b.remainingQty)),
    ).toEqual([3]);
    expect(
      (await prisma.stockTransfer.findUniqueOrThrow({ where: { id: tr.id } }))
        .status,
    ).toBe('DRAFT');
  });
});
