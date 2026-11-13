import { useTestDatabase } from '../../../../test/use-test-database';
useTestDatabase();

import { randomUUID } from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AccountsService } from '../../accounting/accounts/accounts.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { InventoryDocumentsService } from './inventory-documents.service';

/**
 * Inventory documents changed stock levels but never touched FIFO batches, so
 * inbound goods had no cost layer and outbound goods left stale batches behind.
 */
describe('inventory documents keep FIFO batches in step (real database)', () => {
  const prisma = new PrismaService();
  const service = new InventoryDocumentsService(
    prisma,
    { logAction: jest.fn() } as unknown as AuditService,
    new JournalService(prisma, new AccountsService(prisma)),
  );
  let tenantId: string;
  let warehouseId: string;
  let productId: string;
  const userId = undefined as unknown as string;

  beforeAll(async () => {
    const company = await prisma.company.create({
      data: { name: { uz: 'Inv', ru: 'Inv' }, slug: `inv-${randomUUID()}` },
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

  const post = (
    docType: 'INBOUND' | 'OUTBOUND' | 'STOCKTAKING',
    quantity: number,
    unitPrice: number,
  ) =>
    service.createAndPostDocument(
      tenantId,
      { warehouseId, docType, items: [{ productId, quantity, unitPrice }] },
      userId,
    );

  const batches = () =>
    prisma.productBatch.findMany({
      where: { tenantId, productId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  const stock = async () =>
    Number(
      (
        await prisma.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId,
              productId,
            },
          },
        })
      )?.quantity ?? 0,
    );

  it('INBOUND creates a batch at the document unit price', async () => {
    await post('INBOUND', 10, 5000);
    const [batch] = await batches();
    expect(Number(batch.remainingQty)).toBe(10);
    expect(Number(batch.landedCost)).toBe(5000);
    expect(await stock()).toBe(10);
  });

  it('OUTBOUND consumes batches FIFO and is valued at batch cost', async () => {
    await post('INBOUND', 4, 1000);
    await post('INBOUND', 10, 2000);
    const doc = await post('OUTBOUND', 6, 999);

    const [first, second] = await batches();
    expect(Number(first.remainingQty)).toBe(0);
    expect(Number(second.remainingQty)).toBe(8);
    expect(Number(doc.totalAmount)).toBe(4 * 1000 + 2 * 2000);
    expect(
      await prisma.batchConsumption.count({
        where: { inventoryDocumentItemId: doc.items[0].id },
      }),
    ).toBe(2);
    expect(await stock()).toBe(8);
  });

  it('OUTBOUND beyond the batches fails without writing anything', async () => {
    await post('INBOUND', 3, 1000);
    // Stock says 5, batches only cover 3 (legacy drift): must not fall back.
    await prisma.stockLevel.update({
      where: {
        tenantId_warehouseId_productId: { tenantId, warehouseId, productId },
      },
      data: { quantity: 5 },
    });
    const docsBefore = await prisma.inventoryDocument.count({
      where: { tenantId },
    });

    await expect(post('OUTBOUND', 4, 0)).rejects.toThrow();

    expect(await prisma.inventoryDocument.count({ where: { tenantId } })).toBe(
      docsBefore,
    );
    expect(Number((await batches())[0].remainingQty)).toBe(3);
    expect(await stock()).toBe(5);
  });

  it('STOCKTAKING turns a surplus into a batch and a shortage into FIFO consumption', async () => {
    await post('INBOUND', 5, 1000);
    await post('STOCKTAKING', 8, 1500); // +3 surplus
    let all = await batches();
    expect(all.map((b) => Number(b.remainingQty))).toEqual([5, 3]);
    expect(Number(all[1].landedCost)).toBe(1500);

    await post('STOCKTAKING', 2, 0); // -6 shortage, oldest first
    all = await batches();
    expect(all.map((b) => Number(b.remainingQty))).toEqual([0, 2]);
    expect(await stock()).toBe(2);
  });
});
