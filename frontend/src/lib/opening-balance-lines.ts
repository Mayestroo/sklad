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
