export interface RecipeMaterialInput {
  productId: string;
  quantity: number;
}

export interface PlannedMaterial {
  productId: string;
  plannedQuantity: number;
}

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

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function scaleRecipeMaterials(
  outputQuantity: number,
  recipeOutputQuantity: number,
  materials: RecipeMaterialInput[],
): PlannedMaterial[] {
  if (!Number.isFinite(outputQuantity) || outputQuantity <= 0) {
    throw new Error('Output quantity must be greater than zero');
  }
  if (!Number.isFinite(recipeOutputQuantity) || recipeOutputQuantity <= 0) {
    throw new Error('Recipe output quantity must be greater than zero');
  }
  if (!materials.length) {
    throw new Error('Recipe must contain at least one material');
  }

  const multiplier = outputQuantity / recipeOutputQuantity;
  return materials.map((material) => {
    if (
      !material.productId ||
      !Number.isFinite(material.quantity) ||
      material.quantity <= 0
    ) {
      throw new Error('Recipe material quantity must be greater than zero');
    }
    return {
      productId: material.productId,
      plannedQuantity: round(material.quantity * multiplier, 3),
    };
  });
}

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
  let remaining = requestedQuantity;
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

    const quantity = Math.min(availableQuantity, remaining);
    if (quantity <= 0) continue;
    const unitCost = landedCost > 0 ? landedCost : purchasePrice;
    allocations.push({ batchId: batch.id, quantity, unitCost });
    totalCost += quantity * unitCost;
    remaining = round(remaining - quantity, 3);
  }

  if (remaining > 0.0005) {
    throw new Error('Insufficient batch quantity');
  }

  totalCost = round(totalCost, 2);
  return {
    unitCost: round(totalCost / requestedQuantity, 2),
    totalCost,
    batches: allocations,
  };
}
