/**
 * Opening-balance inventory line helpers (muammolar.pdf B2).
 *
 * A product picked on an inventory line brings the cost from its card, in the
 * card's currency, unless the user already typed a cost. A foreign-currency
 * rate is never guessed (ADR 0022): it is left empty for the user to enter.
 */
export interface InventoryLineDraft {
  quantity?: number | null;
  unitCost?: number | null;
  amount?: number;
  currency?: string;
  exchangeRate?: number | string;
}

export interface ProductCostCard {
  costPrice: number | string;
  costPriceCurrency: string | null;
}

export function withProductCost<T extends InventoryLineDraft>(line: T, product: ProductCostCard | undefined): T & InventoryLineDraft {
  if (Number(line.unitCost) > 0) return line;
  if (!product || !(Number(product.costPrice) > 0) || !product.costPriceCurrency) return line;
  const unitCost = Number(product.costPrice);
  return {
    ...line,
    unitCost,
    currency: product.costPriceCurrency,
    exchangeRate: product.costPriceCurrency === 'UZS' ? 1 : '',
    amount: Math.round(Number(line.quantity || 0) * unitCost * 100) / 100,
  };
}

/** The register fields an opening fixed-asset line copies (D6). */
export interface RegisterAssetCard {
  id: string;
  name: string;
  inventoryNumber: string;
  initialCost: number | string;
  accumulatedDepreciation: number | string;
}

export interface FixedAssetLineDraft {
  fixedAssetId?: string | null;
  amount?: number;
  accumulatedDepreciation?: number | null;
  netAmount?: number;
  currency?: string;
  exchangeRate?: number | string;
  notes?: string | null;
  contractNumber?: string | null;
}

/**
 * D6 (owner, option 2): an opening fixed-asset line opens an asset that is
 * already in the fixed-asset register. The register is the source of truth
 * for its cost and accumulated depreciation (kept in UZS), so the line takes
 * them from the asset; the server refuses a line whose values differ.
 * Nothing is depreciated here. No asset: the link and the copied values are
 * cleared.
 */
export function withRegisterAsset<T extends FixedAssetLineDraft>(
  line: T,
  asset: RegisterAssetCard | undefined,
): T & FixedAssetLineDraft {
  if (!asset) {
    return { ...line, fixedAssetId: null, amount: 0, accumulatedDepreciation: 0, netAmount: 0 };
  }
  const amount = Number(asset.initialCost);
  const accumulatedDepreciation = Number(asset.accumulatedDepreciation);
  return {
    ...line,
    fixedAssetId: asset.id,
    amount,
    accumulatedDepreciation,
    netAmount: Math.round((amount - accumulatedDepreciation) * 100) / 100,
    currency: 'UZS',
    exchangeRate: 1,
    notes: asset.name,
    contractNumber: asset.inventoryNumber,
  };
}

/**
 * F8 / ADR 0022: lines on the tables that offer a currency choice (cash,
 * inventory, debts, advances) start blank and must be given a currency.
 * Equity and fixed-asset lines have no currency choice: they are kept in the
 * UZS base currency (fixed assets copy the register, which is UZS).
 */
const UZS_BASE_CATEGORIES = new Set(['EQUITY', 'FIXED_ASSET']);

export interface NewOpeningBalanceLine {
  category: string;
  amount: number;
  currency: string;
  exchangeRate: number | '';
}

export function newOpeningBalanceLine(category: string): NewOpeningBalanceLine {
  const base = UZS_BASE_CATEGORIES.has(category);
  return { category, amount: 0, currency: base ? 'UZS' : '', exchangeRate: base ? 1 : '' };
}

/** 1-based row numbers of lines that still have no currency. */
export function linesMissingCurrency(lines: ReadonlyArray<{ category?: string | null; currency?: string | null }>): number[] {
  return lines.flatMap((line, index) => (line.currency && line.currency.trim() ? [] : [index + 1]));
}

/**
 * One USD rate per document: an opening balance is a snapshot at one date, so
 * every USD line is valued at that date's rate. The page keeps the rate on
 * the document and writes it onto each USD line (UZS lines get 1). A line
 * without a currency keeps its blank rate (the save refuses it).
 */
export function withDocumentRate<T extends { currency?: string | null; exchangeRate?: number | string | null }>(
  lines: ReadonlyArray<T>,
  usdRate: number | string,
): T[] {
  return lines.map((line) => {
    if (line.currency === 'UZS') return { ...line, exchangeRate: 1 };
    if (line.currency === 'USD') return { ...line, exchangeRate: usdRate };
    return line;
  });
}

/**
 * The rate shown on a loaded document: the first USD line's rate, and
 * whether USD lines disagree (an older document typed a rate per line;
 * saving applies the one rate to all of them, so the page says so).
 */
export function documentUsdRate(
  lines: ReadonlyArray<{ currency?: string | null; exchangeRate?: number | string | null }>,
): { rate: string; mixed: boolean } {
  const rates = lines
    .filter((line) => line.currency === 'USD' && Number(line.exchangeRate) > 0)
    .map((line) => Number(line.exchangeRate));
  if (rates.length === 0) return { rate: '', mixed: false };
  return { rate: String(rates[0]), mixed: rates.some((rate) => rate !== rates[0]) };
}

/** True when a USD line exists and the document rate is not a positive number. */
export function needsUsdRate(
  lines: ReadonlyArray<{ currency?: string | null }>,
  usdRate: number | string,
): boolean {
  return lines.some((line) => line.currency === 'USD') && !(Number(usdRate) > 0);
}

/**
 * Debts and advances share one table: the line kind is the category, and it
 * decides which counterparties are offered and the type of a new one.
 */
export const COUNTERPARTY_LINE_KINDS = {
  CUSTOMER_DEBT: { side: 'CUSTOMER', label: { uz: 'Mijoz bizga qarz', ru: 'Клиент должен нам' } },
  SUPPLIER_DEBT: { side: 'SUPPLIER', label: { uz: 'Biz yetkazib beruvchiga qarz', ru: 'Мы должны поставщику' } },
  CUSTOMER_ADVANCE: { side: 'CUSTOMER', label: { uz: 'Mijoz oldindan to‘lagan (avans)', ru: 'Аванс от клиента' } },
  SUPPLIER_ADVANCE: { side: 'SUPPLIER', label: { uz: 'Biz oldindan to‘laganmiz (avans)', ru: 'Аванс поставщику' } },
} as const;

export type CounterpartyLineKind = keyof typeof COUNTERPARTY_LINE_KINDS;

export function isCounterpartyLineKind(category: string | null | undefined): category is CounterpartyLineKind {
  return Boolean(category && category in COUNTERPARTY_LINE_KINDS);
}

/** Counterparties a line of this kind may point at (BOTH fits either side). */
export function counterpartiesForKind<T extends { type: string }>(kind: CounterpartyLineKind, counterparties: ReadonlyArray<T>): T[] {
  const side = COUNTERPARTY_LINE_KINDS[kind].side;
  return counterparties.filter((c) => c.type === side || c.type === 'BOTH');
}

/**
 * muammolar B6 / owner option (c): a suggestion for accumulated depreciation,
 * never posted on its own. Straight line: cost × calendar months between the
 * acquisition month and the opening month ÷ useful life, at most the cost. Returns null when an input is missing; the user can change it.
 */
export function suggestedStraightLineDepreciation(input: {
  cost: number;
  acquisitionDate: string;
  usefulLifeMonths: number;
  asOf: string;
}): number | null {
  const { cost, usefulLifeMonths } = input;
  if (!(cost > 0) || !(usefulLifeMonths > 0) || !input.acquisitionDate || !input.asOf) return null;
  const from = new Date(`${input.acquisitionDate.slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${input.asOf.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (months <= 0) return 0;
  const value = (cost * Math.min(months, usefulLifeMonths)) / usefulLifeMonths;
  return Math.round(value * 100) / 100;
}
