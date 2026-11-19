/**
 * How an opening balance is valued and where each line lands in the ledger.
 * Used by the backend when posting and by the page to show the same totals
 * before posting.
 *
 * The user only enters what the company has and owes; the equity that makes
 * the balance close is computed (assets − liabilities − entered capital) and
 * posted to 8710 "Retained earnings". Every line goes through the auxiliary
 * account 00, which therefore nets to zero.
 */

export type OpeningBalanceCategoryCode =
  | 'CASH'
  | 'BANK'
  | 'INVENTORY'
  | 'CUSTOMER_DEBT'
  | 'SUPPLIER_DEBT'
  | 'CUSTOMER_ADVANCE'
  | 'SUPPLIER_ADVANCE'
  | 'FIXED_ASSET'
  | 'OTHER_ASSET'
  | 'OTHER_LIABILITY'
  | 'EQUITY';

export type OpeningBalanceSection = 'ASSET' | 'LIABILITY' | 'EQUITY';

export const OPENING_BALANCE_SECTION: Record<OpeningBalanceCategoryCode, OpeningBalanceSection> = {
  CASH: 'ASSET',
  BANK: 'ASSET',
  INVENTORY: 'ASSET',
  CUSTOMER_DEBT: 'ASSET',
  SUPPLIER_ADVANCE: 'ASSET',
  FIXED_ASSET: 'ASSET',
  OTHER_ASSET: 'ASSET',
  SUPPLIER_DEBT: 'LIABILITY',
  CUSTOMER_ADVANCE: 'LIABILITY',
  OTHER_LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
};

/** Auxiliary account every opening line is posted against. */
export const OPENING_AUXILIARY_ACCOUNT = '00';
/** Receives the computed balancing equity (positive: profit, negative: loss). */
export const OPENING_RETAINED_EARNINGS_ACCOUNT = '8710';
/** Accumulated depreciation of an opening fixed asset (contra-asset). */
export const OPENING_DEPRECIATION_ACCOUNT = '0200';

/**
 * The ledger account of each category. CASH/BANK lines post to the ledger
 * account of their kassa (5010/5020/5110/5210), so they are not listed here.
 * Customer advances net in 4010 and supplier advances in 6010, the same
 * accounts customer and supplier payments use.
 */
export const OPENING_BALANCE_LEDGER_ACCOUNT: Record<
  Exclude<OpeningBalanceCategoryCode, 'CASH' | 'BANK'>,
  string
> = {
  INVENTORY: '2910',
  CUSTOMER_DEBT: '4010',
  SUPPLIER_ADVANCE: '6010',
  FIXED_ASSET: '0100',
  OTHER_ASSET: '4890',
  SUPPLIER_DEBT: '6010',
  CUSTOMER_ADVANCE: '4010',
  OTHER_LIABILITY: '6990',
  EQUITY: '8330',
};

export interface OpeningBalanceValueLine {
  category?: OpeningBalanceCategoryCode | string | null;
  amount?: number | string | null;
  quantity?: number | string | null;
  unitCost?: number | string | null;
  accumulatedDepreciation?: number | string | null;
  currency?: string | null;
  exchangeRate?: number | string | null;
}

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Rate to UZS, or null when the line has no usable currency/rate yet. */
export function openingLineRate(line: Pick<OpeningBalanceValueLine, 'currency' | 'exchangeRate'>): number | null {
  if (line.currency === 'UZS') return 1;
  if (line.currency !== 'USD') return null;
  const rate = Number(line.exchangeRate);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * The line's value in its own currency. An inventory line is worth
 * quantity × unit cost (the FIFO batch it creates); any typed total is ignored.
 */
export function openingLineAmount(line: OpeningBalanceValueLine): number {
  if (line.category === 'INVENTORY' && line.quantity != null && line.unitCost != null && line.unitCost !== '') {
    return roundMoney(Number(line.quantity) * Number(line.unitCost));
  }
  return roundMoney(Number(line.amount ?? 0));
}

export interface OpeningBalanceTotals {
  /** All assets in UZS, fixed assets at net book value. */
  totalAssets: number;
  totalLiabilities: number;
  /** Capital the user entered (EQUITY lines). */
  enteredEquity: number;
  /** Balancing figure posted to 8710: assets − liabilities − entered capital. */
  retainedEarnings: number;
  /** enteredEquity + retainedEarnings = assets − liabilities. */
  totalEquity: number;
  /** UZS value per category (fixed assets at cost). */
  categoryBreakdown: Record<OpeningBalanceCategoryCode, number>;
  /** False while some line has no currency or a USD line has no rate. */
  hasValidCurrencyRates: boolean;
}

export function computeOpeningBalanceTotals(lines: OpeningBalanceValueLine[]): OpeningBalanceTotals {
  const categoryBreakdown = Object.fromEntries(
    Object.keys(OPENING_BALANCE_SECTION).map((c) => [c, 0]),
  ) as Record<OpeningBalanceCategoryCode, number>;
  let totalAssets = 0;
  let totalLiabilities = 0;
  let enteredEquity = 0;
  let hasValidCurrencyRates = true;

  for (const line of lines) {
    const category = line.category as OpeningBalanceCategoryCode;
    const section = OPENING_BALANCE_SECTION[category];
    if (!section) continue;
    const rate = openingLineRate(line);
    if (rate === null) {
      hasValidCurrencyRates = false;
      continue;
    }
    const value = roundMoney(openingLineAmount(line) * rate);
    categoryBreakdown[category] = roundMoney(categoryBreakdown[category] + value);
    if (section === 'ASSET') {
      const depreciation =
        category === 'FIXED_ASSET' ? roundMoney(Number(line.accumulatedDepreciation ?? 0) * rate) : 0;
      totalAssets += value - depreciation;
    } else if (section === 'LIABILITY') {
      totalLiabilities += value;
    } else {
      enteredEquity += value;
    }
  }

  totalAssets = roundMoney(totalAssets);
  totalLiabilities = roundMoney(totalLiabilities);
  enteredEquity = roundMoney(enteredEquity);
  const retainedEarnings = roundMoney(totalAssets - totalLiabilities - enteredEquity);
  return {
    totalAssets,
    totalLiabilities,
    enteredEquity,
    retainedEarnings,
    totalEquity: roundMoney(enteredEquity + retainedEarnings),
    categoryBreakdown,
    hasValidCurrencyRates,
  };
}
