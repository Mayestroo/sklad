import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * The single FIFO batch consumer. Every document that takes goods out of a
 * warehouse (sales invoice, order dispatch, purchase return, production issue,
 * outbound inventory document, stock transfer) consumes batches through
 * `consumeFifoBatches`, so costing and stock safety rules live in one place:
 *
 * - oldest batch first (createdAt, then id for a deterministic order);
 * - unit cost = batch landedCost (per unit, base currency), or purchasePrice
 *   when landedCost is zero;
 * - all or nothing: if the batches cannot cover the quantity, nothing is
 *   written and the caller's transaction fails (no catalog-cost fallback,
 *   ADR 0022);
 * - every decrement is guarded (`remaining_qty >= quantity`), so concurrent
 *   consumers can never drive a batch negative; the loser fails and retries.
 */

export interface FifoBatchInput {
  id: string;
  remainingQty: number;
  landedCost: number;
  purchasePrice: number;
  createdAt: Date;
}

export interface FifoBatchAllocation {
  batchId: string;
  quantity: number;
  unitCost: number;
}

export interface FifoCostAllocation {
  unitCost: number;
  totalCost: number;
  batches: FifoBatchAllocation[];
}

const INSUFFICIENT = 'Insufficient batch quantity';

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Pure FIFO allocation of `requestedQuantity` over `batches`. */
export function allocateFifoCost(
  requestedQuantity: number,
  batches: FifoBatchInput[],
): FifoCostAllocation {
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error('Requested quantity must be greater than zero');
  }

  const fifoBatches = [...batches].sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id),
  );
  let remaining = round(requestedQuantity, 3);
  let totalCost = 0;
  const allocations: FifoBatchAllocation[] = [];

  for (const batch of fifoBatches) {
    const availableQuantity = Number(batch.remainingQty);
    const landedCost = Number(batch.landedCost);
    const purchasePrice = Number(batch.purchasePrice);
    if (
      !batch.id ||
      !Number.isFinite(availableQuantity) ||
      availableQuantity < 0 ||
      !Number.isFinite(landedCost) ||
      landedCost < 0 ||
      !Number.isFinite(purchasePrice) ||
      purchasePrice < 0
    ) {
      throw new Error(
        'Batch quantities and costs must be valid non-negative numbers',
      );
    }
    if (remaining <= 0) break;

    const quantity = round(Math.min(availableQuantity, remaining), 3);
    if (quantity <= 0) continue;
    const unitCost = landedCost > 0 ? landedCost : purchasePrice;
    allocations.push({ batchId: batch.id, quantity, unitCost });
    totalCost += quantity * unitCost;
    remaining = round(remaining - quantity, 3);
  }

  if (remaining > 0.0005) {
    throw new Error(INSUFFICIENT);
  }

  totalCost = round(totalCost, 2);
  return {
    unitCost: round(totalCost / requestedQuantity, 2),
    totalCost,
    batches: allocations,
  };
}

/** The document line a consumption is recorded against (exactly one). */
export type BatchConsumptionSource =
  | { salesInvoiceItemId: string }
  | { purchaseReturnItemId: string }
  | { inventoryDocumentItemId: string }
  | { stockTransferItemId: string };

export interface ConsumeFifoParams {
  tenantId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  /** Restrict consumption to these batches (e.g. a receipt's own batch). */
  batchIds?: string[];
  /**
   * Record one BatchConsumption row per batch against this line, so the
   * consumption can be restored on unpost/cancel. Omit when the caller keeps
   * its own consumption records (production).
   */
  source?: BatchConsumptionSource;
}

export type FifoWriter = Pick<
  Prisma.TransactionClient,
  'productBatch' | 'batchConsumption'
>;

/**
 * Consumes `quantity` from the warehouse's batches, oldest first, and returns
 * the cost allocation. Call it with the document's transaction client: on
 * failure it throws after possibly decrementing earlier batches, and only the
 * surrounding transaction's rollback undoes those writes.
 */
export async function consumeFifoBatches(
  db: FifoWriter,
  params: ConsumeFifoParams,
): Promise<FifoCostAllocation> {
  const { tenantId, warehouseId, productId, quantity, batchIds, source } =
    params;
  if (!tenantId || !warehouseId || !productId) {
    throw new BadRequestException(
      'FIFO: tenant, ombor va mahsulot ko‘rsatilishi shart',
    );
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new BadRequestException(
      'FIFO: chiqim miqdori 0 dan katta bo‘lishi shart',
    );
  }

  const batches = await db.productBatch.findMany({
    where: {
      tenantId,
      warehouseId,
      productId,
      remainingQty: { gt: 0 },
      ...(batchIds ? { id: { in: batchIds } } : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  let allocation: FifoCostAllocation;
  try {
    allocation = allocateFifoCost(
      quantity,
      batches.map((batch) => ({
        id: batch.id,
        remainingQty: Number(batch.remainingQty),
        landedCost: Number(batch.landedCost),
        purchasePrice: Number(batch.purchasePrice),
        createdAt: batch.createdAt,
      })),
    );
  } catch (error) {
    if (!(error instanceof Error) || error.message !== INSUFFICIENT) {
      throw new BadRequestException(
        `Partiya ma’lumotlari noto‘g‘ri (FIFO): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const available = batches.reduce(
      (sum, batch) => sum + Number(batch.remainingQty),
      0,
    );
    throw new BadRequestException(
      `Partiyalarda yetarli qoldiq yo‘q (FIFO). Mavjud: ${round(available, 3)}, kerak: ${quantity}`,
    );
  }

  for (const item of allocation.batches) {
    const changed = await db.productBatch.updateMany({
      where: { id: item.batchId, remainingQty: { gte: item.quantity } },
      data: { remainingQty: { decrement: item.quantity } },
    });
    if (changed.count !== 1) {
      throw new ConflictException(
        'Partiya qoldig‘i boshqa amal tomonidan o‘zgartirildi. Qayta urinib ko‘ring',
      );
    }
    if (source) {
      await db.batchConsumption.create({
        data: {
          tenantId,
          batchId: item.batchId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          ...source,
        },
      });
    }
  }

  return allocation;
}

/**
 * Puts back everything recorded against `source` (unpost / cancel) and deletes
 * the consumption rows. Returns the restored quantity.
 */
export async function restoreBatchConsumptions(
  db: FifoWriter,
  tenantId: string,
  source: BatchConsumptionSource,
): Promise<number> {
  const consumptions = await db.batchConsumption.findMany({
    where: { tenantId, ...source },
  });
  let restored = 0;
  for (const consumption of consumptions) {
    await db.productBatch.update({
      where: { id: consumption.batchId },
      data: { remainingQty: { increment: consumption.quantity } },
    });
    restored += Number(consumption.quantity);
  }
  await db.batchConsumption.deleteMany({ where: { tenantId, ...source } });
  return round(restored, 3);
}

export interface CreateFifoBatchParams {
  tenantId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  /** Per-unit cost in the base currency (UZS). */
  unitCost: number;
  batchNumber: string;
  /** FIFO age; defaults to now. Transfers keep the source batch's age. */
  createdAt?: Date;
}

/** Adds a new cost layer (batch) to a warehouse. */
export async function createFifoBatch(
  db: Pick<Prisma.TransactionClient, 'productBatch'>,
  params: CreateFifoBatchParams,
) {
  const { quantity, unitCost } = params;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new BadRequestException('Partiya miqdori 0 dan katta bo‘lishi shart');
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new BadRequestException(
      'Partiya tannarxi 0 yoki undan katta bo‘lishi shart',
    );
  }
  const cost = round(unitCost, 2);
  return db.productBatch.create({
    data: {
      tenantId: params.tenantId,
      warehouseId: params.warehouseId,
      productId: params.productId,
      batchNumber: params.batchNumber,
      initialQty: round(quantity, 3),
      remainingQty: round(quantity, 3),
      purchasePrice: cost,
      landedCost: cost,
      ...(params.createdAt ? { createdAt: params.createdAt } : {}),
    },
  });
}
