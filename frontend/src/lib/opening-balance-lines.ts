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
