/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { ManufacturingStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../common/prisma';
import { ProductionService } from './production.service';

describe('ProductionService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const productionId = 'production-1';
  const rawMaterialId = 'raw-material-1';
  const warehouseId = 'warehouse-1';

  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let auditService: { logAction: jest.Mock };
  let service: ProductionService;

  beforeEach(() => {
    tx = {
      productionDocument: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productionMaterialLine: { update: jest.fn(), findMany: jest.fn() },
      productionMaterialBatch: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      productionMaterialMovement: { create: jest.fn() },
      stockLevel: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      productBatch: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        create: jest.fn(),
      },
      product: { update: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn(
        (callback: (client: Prisma.TransactionClient) => unknown) =>
          callback(tx as unknown as Prisma.TransactionClient),
      ),
      productionDocument: { count: jest.fn(), create: jest.fn() },
      productionRecipe: { findFirst: jest.fn() },
      product: { findFirst: jest.fn(), findMany: jest.fn() },
      stockLevel: { findUnique: jest.fn() },
      productBatch: { findMany: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    auditService = { logAction: jest.fn().mockResolvedValue(undefined) };
    service = new ProductionService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  it('creates a draft document without changing stock or batch balances', async () => {
    jest.spyOn(service, 'preview').mockResolvedValue({
      recipe: { id: 'recipe-1', productId: 'finished-1' },
      plannedMaterialCost: 25_000,
      materials: [
        {
          productId: rawMaterialId,
          plannedQuantity: 2,
          product: { id: rawMaterialId },
          freeQuantity: 5,
          shortage: 0,
        },
      ],
    } as unknown as Awaited<ReturnType<ProductionService['preview']>>);
    prisma.productionDocument.count.mockResolvedValue(0);
    prisma.productionDocument.create.mockResolvedValue({
      id: productionId,
      status: ManufacturingStatus.DRAFT,
      materials: [],
    });

    const created = await service.createDocument(tenantId, userId, {
      recipeId: 'recipe-1',
      plannedQuantity: 1,
      warehouseId,
    });

    expect(created.status).toBe(ManufacturingStatus.DRAFT);
    expect(created.stockWarnings).toEqual([]);
    expect(prisma.productionDocument.create).toHaveBeenCalled();
    expect(tx.stockLevel.update).not.toHaveBeenCalled();
    expect(tx.stockLevel.updateMany).not.toHaveBeenCalled();
    expect(tx.productBatch.updateMany).not.toHaveBeenCalled();
  });

  it('starts production by deducting the planned quantity from FIFO batches', async () => {
    tx.productionDocument.findFirst.mockResolvedValue({
      id: productionId,
      tenantId,
      warehouseId,
      status: ManufacturingStatus.PLANNED,
      materials: [
        {
          id: 'line-1',
          productionDocumentId: productionId,
          productId: rawMaterialId,
          plannedQuantity: new Prisma.Decimal(3),
        },
      ],
    });
    tx.stockLevel.findUnique.mockResolvedValue({
      id: 'stock-1',
      quantity: new Prisma.Decimal(10),
      reservedQuantity: new Prisma.Decimal(0),
    });
    tx.productBatch.findMany.mockResolvedValue([
      {
        id: 'old-batch',
        remainingQty: new Prisma.Decimal(2),
        landedCost: new Prisma.Decimal(5000),
        purchasePrice: new Prisma.Decimal(5000),
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'new-batch',
        remainingQty: new Prisma.Decimal(4),
        landedCost: new Prisma.Decimal(6000),
        purchasePrice: new Prisma.Decimal(6000),
        createdAt: new Date('2026-02-01'),
      },
    ]);
    tx.productionDocument.update.mockResolvedValue({
      id: productionId,
      status: ManufacturingStatus.IN_PROGRESS,
    });

    await service.start(tenantId, userId, productionId);

    expect(tx.productBatch.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'old-batch', remainingQty: { gte: 2 } },
        data: { remainingQty: { decrement: 2 } },
      }),
    );
    expect(tx.productBatch.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'new-batch', remainingQty: { gte: 1 } },
        data: { remainingQty: { decrement: 1 } },
      }),
    );
    expect(tx.productionMaterialBatch.upsert).toHaveBeenCalledTimes(2);
    expect(tx.productionMaterialMovement.create).toHaveBeenCalledTimes(2);
    expect(tx.productionMaterialMovement.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'ISSUE',
          batchId: 'old-batch',
          quantity: 2,
        }),
      }),
    );
    expect(tx.stockLevel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stock-1', quantity: { gte: 3 } },
        data: { quantity: { decrement: 3 } },
      }),
    );
  });

  it('reconciles a lower actual material quantity by returning unused FIFO stock', async () => {
    tx.productionDocument.findFirst.mockResolvedValue({
      id: productionId,
      tenantId,
      warehouseId,
      status: ManufacturingStatus.IN_PROGRESS,
      materials: [
        {
          id: 'line-1',
          productId: rawMaterialId,
          actualQuantity: new Prisma.Decimal(1),
          batchConsumptions: [
            {
              id: 'allocation-1',
              batchId: 'batch-1',
              quantity: new Prisma.Decimal(1),
              unitCost: new Prisma.Decimal(5000),
            },
          ],
        },
      ],
    });
    tx.productionMaterialBatch.findMany.mockResolvedValue([
      { quantity: new Prisma.Decimal(0.5), unitCost: new Prisma.Decimal(5000) },
    ]);
    tx.productionMaterialLine.findMany.mockResolvedValue([
      { totalCost: new Prisma.Decimal(2500) },
    ]);
    tx.productionDocument.update.mockResolvedValue({
      id: productionId,
      actualMaterialCost: new Prisma.Decimal(2500),
    });

    await service.updateActualMaterials(tenantId, userId, productionId, {
      materials: [{ productId: rawMaterialId, actualQuantity: 0.5 }],
    });

    expect(tx.productBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { remainingQty: { increment: 0.5 } },
    });
    expect(tx.stockLevel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_warehouseId_productId: {
            tenantId,
            warehouseId,
            productId: rawMaterialId,
          },
        },
        data: { quantity: { increment: 0.5 } },
      }),
    );
    expect(tx.productionMaterialBatch.update).toHaveBeenCalledWith({
      where: { id: 'allocation-1' },
      data: { quantity: { decrement: 0.5 } },
    });
    expect(tx.productionMaterialMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'RETURN',
          batchId: 'batch-1',
          quantity: 0.5,
          unitCost: 5000,
        }),
      }),
    );
  });

  it('receives the finished quantity into stock with actual material cost per unit', async () => {
    tx.productionDocument.findFirst.mockResolvedValue({
      id: productionId,
      tenantId,
      productId: 'finished-1',
      warehouseId,
      docNumber: 'PRD-2026-0001',
      status: ManufacturingStatus.READY,
      materials: [
        {
          actualQuantity: new Prisma.Decimal(2),
          totalCost: new Prisma.Decimal(68_600),
        },
      ],
    });
    tx.productionDocument.update.mockResolvedValue({
      id: productionId,
      status: ManufacturingStatus.COMPLETED,
    });

    await service.complete(tenantId, userId, productionId, {
      producedQuantity: 2,
    });

    expect(tx.stockLevel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_warehouseId_productId: {
            tenantId,
            warehouseId,
            productId: 'finished-1',
          },
        },
        update: { quantity: { increment: 2 } },
      }),
    );
    expect(tx.productBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productionDocumentId: productionId,
          initialQty: 2,
          remainingQty: 2,
          landedCost: 34_300,
          purchasePrice: 34_300,
        }),
      }),
    );
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'finished-1' },
      data: {
        costPrice: 34_300,
        costPriceCurrency: 'UZS',
        costPriceExchangeRate: 1,
      },
    });
  });
});
