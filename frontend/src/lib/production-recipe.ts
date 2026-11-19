/**
 * Production recipe helpers: entry units and the cost estimate.
 *
 * A recipe stores every material in the material's own unit (the unit of its
 * product card), with 3 decimals. In the form a material may be typed in a
 * smaller unit of the same kind (grams for a kg material, ml for litres,
 * cm/mm for metres); it is converted to the card unit before saving.
 *
 * The cost is an estimate from the product cards' cost price, in UZS. The
 * real cost is taken from FIFO batches when production starts. A USD cost
 * without a rate is never guessed (ADR 0022): that material has no estimate.
 */

export interface EntryUnit {
  code: string;
  /** How many card units one entry unit is (g → kg: 0.001). */
  factor: number;
}

const SUB_UNITS: Record<string, EntryUnit[]> = {
  kg: [{ code: 'g', factor: 0.001 }],
  liter: [{ code: 'ml', factor: 0.001 }],
  meter: [
    { code: 'cm', factor: 0.01 },
    { code: 'mm', factor: 0.001 },
  ],
};

/** The units a material can be typed in: its card unit first. */
export function entryUnitsFor(cardUnit: string | null | undefined): EntryUnit[] {
  const base = cardUnit || 'piece';
  return [{ code: base, factor: 1 }, ...(SUB_UNITS[base] ?? [])];
}

const roundTo = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
};

/**
 * Quantity in the card unit, or null when it cannot be stored: not a
 * positive number, or finer than the 3 decimals the recipe keeps (e.g.
 * 0.4 g of a kg material). The caller asks for a larger output norm then.
 */
export function toCardQuantity(quantity: number | string, entryUnit: string, cardUnit: string | null | undefined): number | null {
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = entryUnitsFor(cardUnit).find((u) => u.code === entryUnit);
  if (!unit) return null;
  const inCard = value * unit.factor;
  const stored = roundTo(inCard, 3);
  if (stored <= 0 || Math.abs(stored - inCard) > 1e-9) return null;
  return stored;
}

export interface CostCard {
  costPrice?: number | string | null;
  costPriceCurrency?: string | null;
  costPriceExchangeRate?: number | string | null;
}

/** Card cost of one card unit in UZS, or null when unknown. */
export function unitCostUzs(card: CostCard | null | undefined): number | null {
  if (!card) return null;
  const cost = Number(card.costPrice);
  if (!Number.isFinite(cost) || cost <= 0) return null;
  if (card.costPriceCurrency === 'UZS') return cost;
  if (card.costPriceCurrency === 'USD') {
    const rate = Number(card.costPriceExchangeRate);
    return Number.isFinite(rate) && rate > 0 ? roundTo(cost * rate, 2) : null;
  }
  return null;
}

export interface RecipeCostLine {
  /** Card-unit quantity, or null when the line is not complete/storable. */
  quantity: number | null;
  card: CostCard | null | undefined;
}

export interface RecipeCostEstimate {
  lines: Array<{ unitCost: number | null; total: number | null }>;
  /** Material cost of one output norm, of the lines that have a cost. */
  total: number;
  /** total ÷ output norm, or null without a positive norm. */
  perUnit: number | null;
  /** Some complete line has no card cost, so the total is incomplete. */
  incomplete: boolean;
}

export function estimateRecipeCost(lines: RecipeCostLine[], outputQuantity: number | string): RecipeCostEstimate {
  let total = 0;
  let incomplete = false;
  const out = lines.map((line) => {
    const unitCost = unitCostUzs(line.card);
    if (line.quantity === null) return { unitCost, total: null };
    if (unitCost === null) {
      incomplete = true;
      return { unitCost, total: null };
    }
    const lineTotal = roundTo(line.quantity * unitCost, 2);
    total += lineTotal;
    return { unitCost, total: lineTotal };
  });
  total = roundTo(total, 2);
  const norm = Number(outputQuantity);
  return {
    lines: out,
    total,
    perUnit: Number.isFinite(norm) && norm > 0 ? roundTo(total / norm, 2) : null,
    incomplete,
  };
}
