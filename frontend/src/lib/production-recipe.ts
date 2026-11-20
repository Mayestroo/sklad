/**
 * Production recipe helpers for the forms. Every calculation comes from the
 * shared costing module (shared/production/costing.ts), the same code the
 * backend stores costs with (TZ "Ishlab chiqarish" 8.1: one conversion
 * function, never repeated).
 */
import {
  cardUnitCostUzs,
  computeRecipeCost,
  isValidLossPercent,
  resolveUnitFactor,
  unitOptionsFor,
  type RecipeCostResult,
} from '../../../shared/production/costing.ts';

export {
  cardUnitCostUzs,
  computeProductionCost,
  computeRecipeCost,
  deviationPercent,
  isValidLossPercent,
  MAX_LOSS_PERCENT,
  resolveUnitFactor,
  roundMoney,
  unitOptionsFor,
} from '../../../shared/production/costing.ts';
export type { ProductUnitInput, RecipeCostResult, UnitOption } from '../../../shared/production/costing.ts';

/** A material as GET /production/materials returns it. */
export interface MaterialCard {
  id: string;
  name: unknown;
  sku?: string | null;
  type: string;
  isSemiFinished?: boolean;
  unitOfMeasure: string;
  units?: Array<{ name: string; factor: number | string }>;
  costPrice?: number | string | null;
  costPriceCurrency?: string | null;
  costPriceExchangeRate?: number | string | null;
  stock_qty?: number;
}

export interface RecipeFormLine {
  productId: string;
  /** As typed (comma or dot decimal). */
  quantity: string;
  /** Entry unit code; empty = the base unit. */
  unit: string;
  lossPercent: string;
}

/** A typed number: comma or dot decimal, spaces ignored; null when blank or invalid. */
export function parseDecimal(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s/g, '').replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export interface RecipeLineInfo {
  /** Base units in one entry unit, or null when the unit is unknown. */
  factor: number | null;
  hasPrice: boolean;
  quantity: number | null;
  loss: number | null;
}

/** The form's live estimate (TZ 4.4): recalculated on every change, no reload. */
export function estimateRecipeForm(
  lines: ReadonlyArray<RecipeFormLine>,
  materials: ReadonlyMap<string, MaterialCard>,
  outputQuantity: string | number,
): RecipeCostResult & { info: RecipeLineInfo[] } {
  const info: RecipeLineInfo[] = [];
  const result = computeRecipeCost(
    lines.map((line) => {
      const material = materials.get(line.productId);
      const factor = material
        ? resolveUnitFactor(
            material.unitOfMeasure,
            line.unit && line.unit !== material.unitOfMeasure ? line.unit : null,
            (material.units ?? []).map((u) => ({ name: u.name, factor: Number(u.factor) })),
          )
        : null;
      const card = cardUnitCostUzs(material ?? null);
      const quantity = parseDecimal(line.quantity);
      const loss = line.lossPercent.trim() === '' ? 0 : parseDecimal(line.lossPercent);
      info.push({ factor, hasPrice: card.hasPrice, quantity, loss });
      const usable = material && factor !== null && quantity !== null && quantity > 0 && loss !== null && isValidLossPercent(loss);
      return {
        quantity: usable ? quantity : null,
        unitFactor: factor ?? 1,
        lossPercent: usable ? loss : 0,
        unitCost: card.unitCost,
        hasPrice: card.hasPrice,
      };
    }),
    parseDecimal(outputQuantity) ?? 0,
  );
  return { ...result, info };
}

/** Units a material can be typed in (base unit first, then sub-units and card units). */
export function materialUnitOptions(material: MaterialCard | undefined) {
  if (!material) return [];
  return unitOptionsFor(
    material.unitOfMeasure,
    (material.units ?? []).map((u) => ({ name: u.name, factor: Number(u.factor) })),
  );
}
