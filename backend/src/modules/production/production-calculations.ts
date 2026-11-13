// FIFO allocation lives in the shared inventory module; re-exported for callers.
export {
  allocateFifoCost,
  type FifoBatchAllocation,
  type FifoBatchInput,
  type FifoCostAllocation,
} from '../inventory/fifo/fifo-batches';

export interface RecipeMaterialInput {
  productId: string;
  quantity: number;
}

export interface PlannedMaterial {
  productId: string;
  plannedQuantity: number;
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
