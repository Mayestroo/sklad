/**
 * Production costing: the one place where units are converted and recipe /
 * production costs are calculated (TZ "Ishlab chiqarish" 8). The backend and
 * the frontend both import this file, so a recipe shows in the form exactly
 * the cost the server stores.
 *
 * Rules (TZ 8.2, 8.3):
 *   1. base quantity   = quantity × unit factor
 *   2. consumption     = base quantity ÷ (1 − loss %)
 *   3. material amount = consumption × unit cost (UZS per base unit)
 *   4. total cost      = Σ material amounts + extra costs
 *   5. unit cost       = total cost ÷ produced quantity
 * Intermediate values are never rounded; only final money amounts are
 * rounded to 2 decimals (UZS). Stock quantities keep 3 decimals.
 *
 * Self-contained (no imports): the frontend loads it with Node's type
 * stripping and the backend through tsc.
 */

/** Smaller units of the same kind every base unit offers (1 g = 0.001 kg). */
export const STANDARD_SUB_UNITS: Readonly<Record<string, ReadonlyArray<{ code: string; factor: number }>>> = {
  kg: [{ code: 'g', factor: 0.001 }],
  liter: [{ code: 'ml', factor: 0.001 }],
  meter: [
    { code: 'cm', factor: 0.01 },
    { code: 'mm', factor: 0.001 },
  ],
};

/** An extra unit stored on the product card: 1 `name` = `factor` base units. */
export interface ProductUnitInput {
  name: string;
  factor: number | string;
}

export interface UnitOption {
  /** Unit code ('kg', 'g') or the product unit's name ('qop'). */
  code: string;
  /** Base units in one of this unit. */
  factor: number;
  /** The base unit itself. */
  isBase: boolean;
  /** Defined on the product card (not a standard sub-unit). */
  isProductUnit: boolean;
}

/** Every unit a product can be counted in: the base unit first. */
export function unitOptionsFor(
  baseUnit: string | null | undefined,
  productUnits: ReadonlyArray<ProductUnitInput> = [],
): UnitOption[] {
  const base = baseUnit || 'piece';
  const options: UnitOption[] = [{ code: base, factor: 1, isBase: true, isProductUnit: false }];
  for (const sub of STANDARD_SUB_UNITS[base] ?? []) {
    options.push({ code: sub.code, factor: sub.factor, isBase: false, isProductUnit: false });
  }
  for (const unit of productUnits) {
    const factor = Number(unit.factor);
    if (!unit.name || !(factor > 0) || options.some((o) => o.code === unit.name)) continue;
    options.push({ code: unit.name, factor, isBase: false, isProductUnit: true });
  }
  return options;
}

/**
 * Base units in one `unit` of a product, or null when the product has no
 * such unit. An empty unit means the base unit.
 */
export function resolveUnitFactor(
  baseUnit: string | null | undefined,
  unit: string | null | undefined,
  productUnits: ReadonlyArray<ProductUnitInput> = [],
): number | null {
  if (!unit) return 1;
  return unitOptionsFor(baseUnit, productUnits).find((o) => o.code === unit)?.factor ?? null;
}

/** Step 1: quantity in the base unit. */
export function toBaseQuantity(quantity: number, factor: number): number {
  return quantity * factor;
}

export const MAX_LOSS_PERCENT = 99.99;

/** Whether a loss percent is allowed (0 … 99.99). */
export function isValidLossPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= MAX_LOSS_PERCENT;
}

/** Step 2: what must be taken from stock so that `baseQuantity` remains after the loss. */
export function grossConsumption(baseQuantity: number, lossPercent: number): number {
  if (!isValidLossPercent(lossPercent)) {
    throw new Error('Loss percent must be between 0 and 99.99');
  }
  return baseQuantity / (1 - lossPercent / 100);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Per-unit costs keep 4 decimals (DECIMAL(17,4) columns). */
export function roundUnitCost(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export interface CostCardInput {
  costPrice?: number | string | null;
  costPriceCurrency?: string | null;
  costPriceExchangeRate?: number | string | null;
}

/**
 * The card cost of one base unit in UZS. A card without a price gives 0
 * (TZ 4.3: "narx yo'q" is 0 with a warning, never "—"); `hasPrice` tells the
 * two apart. A USD cost without a rate is never guessed (ADR 0022): it has no
 * price.
 */
export function cardUnitCostUzs(card: CostCardInput | null | undefined): { unitCost: number; hasPrice: boolean } {
  const cost = Number(card?.costPrice);
  if (!card || !Number.isFinite(cost) || cost <= 0) return { unitCost: 0, hasPrice: false };
  if (card.costPriceCurrency === 'UZS' || !card.costPriceCurrency) return { unitCost: cost, hasPrice: true };
  const rate = Number(card.costPriceExchangeRate);
  if (Number.isFinite(rate) && rate > 0) return { unitCost: cost * rate, hasPrice: true };
  return { unitCost: 0, hasPrice: false };
}

export interface RecipeCostLineInput {
  /** Quantity in the entry unit; null/invalid lines are skipped. */
  quantity: number | null;
  /** Base units in one entry unit. */
  unitFactor: number;
  lossPercent: number;
  /** UZS per base unit (0 when the material has no price). */
  unitCost: number;
  hasPrice: boolean;
}

export interface RecipeCostLine {
  baseQuantity: number | null;
  consumption: number | null;
  /** Unit cost per entry unit (what the form shows next to the unit). */
  entryUnitCost: number;
  total: number | null;
}

export interface RecipeCostResult {
  lines: RecipeCostLine[];
  /** "Norma uchun xomashyo": material cost of one output norm. */
  normTotal: number;
  /** "1 dona tannarxi": normTotal ÷ output norm; null without a positive norm. */
  perUnit: number | null;
  /** Some complete line has no price: the cost is not fully calculated. */
  missingPrice: boolean;
}

export function computeRecipeCost(lines: ReadonlyArray<RecipeCostLineInput>, outputQuantity: number | string): RecipeCostResult {
  let normTotalRaw = 0;
  let missingPrice = false;
  const out = lines.map((line): RecipeCostLine => {
    const entryUnitCost = line.unitCost * line.unitFactor;
    const quantity = line.quantity;
    if (quantity === null || !Number.isFinite(quantity) || quantity <= 0 || !isValidLossPercent(line.lossPercent)) {
      return { baseQuantity: null, consumption: null, entryUnitCost, total: null };
    }
    if (!line.hasPrice) missingPrice = true;
    const baseQuantity = toBaseQuantity(quantity, line.unitFactor);
    const consumption = grossConsumption(baseQuantity, line.lossPercent);
    const raw = consumption * line.unitCost;
    normTotalRaw += raw;
    return { baseQuantity, consumption, entryUnitCost, total: roundMoney(raw) };
  });
  const norm = Number(outputQuantity);
  return {
    lines: out,
    normTotal: roundMoney(normTotalRaw),
    perUnit: Number.isFinite(norm) && norm > 0 ? roundMoney(normTotalRaw / norm) : null,
    missingPrice,
  };
}

/**
 * Material to take from stock for a production document: the recipe line's
 * consumption scaled from the recipe norm to the planned quantity, in the
 * base unit with 3 decimals (stock precision).
 */
export function plannedMaterialQuantity(
  line: { quantity: number; unitFactor: number; lossPercent: number },
  plannedQuantity: number,
  recipeOutputQuantity: number,
): number {
  if (!(plannedQuantity > 0)) throw new Error('Planned quantity must be greater than zero');
  if (!(recipeOutputQuantity > 0)) throw new Error('Recipe output quantity must be greater than zero');
  const consumption = grossConsumption(toBaseQuantity(line.quantity, line.unitFactor), line.lossPercent);
  return roundQuantity((consumption * plannedQuantity) / recipeOutputQuantity);
}

export interface ProductionCostResult {
  materialCost: number;
  extraCost: number;
  totalCost: number;
  unitCost: number;
}

/**
 * Steps 4–5 for a completed document. Returns null when nothing was produced
 * (TZ 8.3: no division by zero; the caller shows a clear message).
 */
export function computeProductionCost(
  materialCost: number,
  extraCosts: ReadonlyArray<number>,
  producedQuantity: number,
): ProductionCostResult | null {
  if (!Number.isFinite(producedQuantity) || producedQuantity <= 0) return null;
  const extraRaw = extraCosts.reduce((sum, amount) => sum + amount, 0);
  const totalRaw = materialCost + extraRaw;
  return {
    materialCost: roundMoney(materialCost),
    extraCost: roundMoney(extraRaw),
    totalCost: roundMoney(totalRaw),
    unitCost: roundUnitCost(totalRaw / producedQuantity),
  };
}

/** Plan vs. actual deviation in percent (null when nothing was planned). */
export function deviationPercent(planned: number, actual: number): number | null {
  if (!(planned > 0)) return null;
  return Math.round(((actual - planned) / planned) * 10000) / 100;
}

export interface RecipeGraphEdge {
  /** Product the recipe makes. */
  productId: string;
  /** Products the recipe consumes. */
  materialIds: ReadonlyArray<string>;
}

export const MAX_RECIPE_DEPTH = 3;

/**
 * Checks the recipe graph after saving `candidate` (TZ 4.6): no cycle and at
 * (`edges` must not contain the recipe being edited; several recipes of one
 * product are merged)
 * most three nested levels. Returns the cycle as product ids
 * ([Xamir, Non, Xamir]) or the depth found, or null when the graph is fine.
 */
export function checkRecipeGraph(
  edges: ReadonlyArray<RecipeGraphEdge>,
  candidate: RecipeGraphEdge,
): { cycle: string[] } | { depth: number } | null {
  const graph = new Map<string, Set<string>>();
  for (const edge of [...edges, candidate]) {
    const set = graph.get(edge.productId) ?? new Set<string>();
    edge.materialIds.forEach((id) => set.add(id));
    graph.set(edge.productId, set);
  }

  // Cycle through the candidate: a path from one of its materials back to it.
  const findPath = (from: string, target: string, seen: Set<string>): string[] | null => {
    if (from === target) return [from];
    if (seen.has(from)) return null;
    seen.add(from);
    for (const next of graph.get(from) ?? []) {
      const path = findPath(next, target, seen);
      if (path) return [from, ...path];
    }
    return null;
  };
  for (const material of candidate.materialIds) {
    const path = findPath(material, candidate.productId, new Set());
    if (path) return { cycle: [candidate.productId, ...path] };
  }

  // Depth: levels of recipes, a recipe of raw materials only is level 1.
  const depthOf = (id: string, stack: Set<string>): number => {
    const children = graph.get(id);
    if (!children || children.size === 0 || stack.has(id)) return 0;
    stack.add(id);
    let max = 0;
    for (const child of children) max = Math.max(max, depthOf(child, stack));
    stack.delete(id);
    return max + 1;
  };
  // The candidate's own depth, and the depth of every recipe that uses it.
  let maxDepth = 0;
  for (const id of graph.keys()) maxDepth = Math.max(maxDepth, depthOf(id, new Set()));
  if (maxDepth > MAX_RECIPE_DEPTH) return { depth: maxDepth };
  return null;
}
