import { PrismaService } from '../../common/prisma';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../accounting/journal/journal.service';
import { InventoryDocumentsService } from './documents/inventory-documents.service';
import { StockTransfersService } from './transfers/stock-transfers.service';

jest.mock('../../common/sequences/document-sequence');
jest.mock('../../common/prisma/assert-tenant-owned');
jest.mock('../../common/accounting-period/period-lock');

/**
 * ADR 0006: stock movements and their automatic journal entries commit together.
 * A movement whose journal entry cannot be posted must fail, not leave the ledger
 * silently out of step with the warehouse.
 */
function createPrismaMock() {
  const state = { insideTransaction: false, transferStatus: 'DRAFT' };
  const transfer = (status: string) => ({
    id: 'tr-1',
    tenantId: 'tenant-1',
    transferNumber: 'TR-000001',
    status,
    sourceWarehouseId: 'wh-a',
    targetWarehouseId: 'wh-b',
    items: [
      {
        id: 'tri-1',
        productId: 'p-1',
        quantity: 2,
        product: { id: 'p-1', costPrice: 100 },
      },
    ],
  });
  const tx = {
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'wh-a' }) },
    inventoryDocument: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({
        id: 'doc-1',
        docNumber: 'IN-000001',
        totalAmount: 0,
      }),
      update: jest.fn().mockResolvedValue({
        id: 'doc-1',
        docNumber: 'IN-000001',
        totalAmount: 500,
        items: [],
      }),
    },
    inventoryDocumentItem: {
      create: jest.fn().mockResolvedValue({ id: 'line-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    productBatch: {
      create: jest.fn().mockResolvedValue({ id: 'batch-1' }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'batch-src',
          remainingQty: 10,
          landedCost: 100,
          purchasePrice: 100,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    batchConsumption: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'bc-1',
          quantity: 2,
          unitCost: 100,
          batch: { createdAt: new Date('2026-01-01T00:00:00Z') },
        },
      ]),
    },
    stockLevel: {
      findUnique: jest.fn().mockResolvedValue({ quantity: 10 }),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
    stockTransfer: {
      findFirst: jest.fn(() => Promise.resolve(transfer(state.transferStatus))),
      update: jest.fn(() => Promise.resolve(transfer('IN_TRANSIT'))),
    },
  };
  return {
    ...tx,
    state,
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => {
        state.insideTransaction = true;
        try {
          return await callback(tx);
        } finally {
          state.insideTransaction = false;
        }
      },
    ),
  };
}

describe('inventory movements post their journal entry atomically', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let journal: {
    autoPostInboundDoc: jest.Mock;
    autoPostShipTransfer: jest.Mock;
    autoPostReceiveTransfer: jest.Mock;
  };
  let postedInsideTransaction: boolean[];
  let documents: InventoryDocumentsService;
  let transfers: StockTransfersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    postedInsideTransaction = [];
    const record = () => {
      postedInsideTransaction.push(prisma.state.insideTransaction);
      return Promise.resolve();
    };
    journal = {
      autoPostInboundDoc: jest.fn(record),
      autoPostShipTransfer: jest.fn(record),
      autoPostReceiveTransfer: jest.fn(record),
    };
    const audit = { logAction: jest.fn().mockResolvedValue(undefined) };
    documents = new InventoryDocumentsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      journal as unknown as JournalService,
    );
    transfers = new StockTransfersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      journal as unknown as JournalService,
    );
  });

  const inbound = {
    warehouseId: 'wh-a',
    docType: 'INBOUND' as const,
    items: [{ productId: 'p-1', quantity: 5, unitPrice: 100 }],
  };

  it('fails an inbound document whose journal entry cannot be posted', async () => {
    journal.autoPostInboundDoc.mockRejectedValue(
      new Error('ledger unavailable'),
    );
    await expect(
      documents.createAndPostDocument('tenant-1', inbound, 'user-1'),
    ).rejects.toThrow('ledger unavailable');
  });

  it('posts the inbound journal entry inside the stock transaction', async () => {
    await documents.createAndPostDocument('tenant-1', inbound, 'user-1');
    expect(postedInsideTransaction).toEqual([true]);
  });

  it('fails a shipment whose journal entry cannot be posted', async () => {
    journal.autoPostShipTransfer.mockRejectedValue(
      new Error('ledger unavailable'),
    );
    await expect(
      transfers.shipTransfer('tenant-1', 'tr-1', 'user-1'),
    ).rejects.toThrow('ledger unavailable');
  });

  it('posts the shipment journal entry inside the stock transaction', async () => {
    await transfers.shipTransfer('tenant-1', 'tr-1', 'user-1');
    expect(postedInsideTransaction).toEqual([true]);
  });

  it('fails a receipt whose journal entry cannot be posted', async () => {
    prisma.state.transferStatus = 'IN_TRANSIT';
    journal.autoPostReceiveTransfer.mockRejectedValue(
      new Error('ledger unavailable'),
    );
    await expect(
      transfers.receiveTransfer('tenant-1', 'tr-1', 'user-1'),
    ).rejects.toThrow('ledger unavailable');
  });

  it('posts the receipt journal entry inside the stock transaction', async () => {
    prisma.state.transferStatus = 'IN_TRANSIT';
    await transfers.receiveTransfer('tenant-1', 'tr-1', 'user-1');
    expect(postedInsideTransaction).toEqual([true]);
  });
});
