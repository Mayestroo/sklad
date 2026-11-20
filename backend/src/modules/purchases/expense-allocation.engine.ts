import { BadRequestException } from '@nestjs/common';
import { ExpenseAllocationMethod, Prisma } from '@prisma/client';

/** Inputs are read through Number(), so Prisma Decimals are accepted as-is. */
type Numeric = number | string | Prisma.Decimal;

export interface AllocationTargetItem {
  id: string;
  productId: string;
  product?: {
    name?: Prisma.JsonValue;
    sku?: string;
    weight?: Numeric | null;
    unitOfMeasure?: string;
  } | null;
  quantity: Numeric;
  unitPrice: Numeric;
  totalPrice?: Numeric;
  weight?: Numeric | null;
  landedCost?: Numeric | null;
}

export interface BatchInfo {
  productId: string;
  remainingQty: Numeric;
}

export interface AllocationPreviewItem {
  receiptItemId: string;
  productId: string;
  productName: Prisma.JsonValue | undefined;
  sku: string;
  unitOfMeasure: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  weight: number;
  initialLandedCost: number;
  allocatedAmount: number;
  allocatedPerUnit: number;
  newLandedCost: number;
  costIncreasePercent: number;
  soldQuantity: number;
  remainingQuantity: number;
  cogsAdjustment: number;
  stockAdjustment: number;
}

export interface AllocationPreviewResult {
  expenseAmount: number;
  allocationMethod: ExpenseAllocationMethod;
  allocatedTotal: number;
  remainder: number;
  items: AllocationPreviewItem[];
}

/** A line's unit weight: its own, else the product card's; null when neither is set. */
export function knownUnitWeight(item: {
  weight?: Numeric | null;
  product?: { weight?: Numeric | null } | null;
}): number | null {
  const own = Number(item.weight);
  if (Number.isFinite(own) && own > 0) return own;
  const card = Number(item.product?.weight);
  return Number.isFinite(card) && card > 0 ? card : null;
}

/**
 * BY_WEIGHT needs every line's weight (ADR 0022): a missing weight is
 * refused, never taken as 1 kg.
 */
export function requireUnitWeight(item: {
  weight?: Numeric | null;
  product?: { weight?: Numeric | null; sku?: string } | null;
}): number {
  const weight = knownUnitWeight(item);
  if (weight === null) {
    const sku = item.product?.sku ? ` ${item.product.sku}` : '';
    throw new BadRequestException(
      `Weight is not set for product${sku}: set it or allocate by amount or quantity`,
    );
  }
  return weight;
}

/**
 * Pure Mathematical Engine for Expense Allocation across Inventory Items
 * Handles BY_AMOUNT, BY_QUANTITY, BY_WEIGHT methods and enforces the Allocation Remainder Rule.
 */
export class ExpenseAllocationEngine {
  /**
   * Calculates the allocation basis sum based on the chosen method
   */
  static computeBasisSum(
    items: AllocationTargetItem[],
    method: ExpenseAllocationMethod,
  ): number {
    let basisSum = 0;
    if (method === ExpenseAllocationMethod.BY_AMOUNT) {
      basisSum = items.reduce((sum, i) => sum + (Number(i.totalPrice) || 0), 0);
    } else if (method === ExpenseAllocationMethod.BY_QUANTITY) {
      basisSum = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    } else if (method === ExpenseAllocationMethod.BY_WEIGHT) {
      basisSum = items.reduce(
        (sum, i) => sum + (Number(i.quantity) || 0) * requireUnitWeight(i),
        0,
      );
    }

    return basisSum <= 0 ? items.length : basisSum;
  }

  /**
   * Distributes total expense amount across target items with the exact Allocation Remainder Rule.
   */
  static allocateExpense(
    targetItems: AllocationTargetItem[],
    totalAmount: number,
    allocationMethod: ExpenseAllocationMethod = ExpenseAllocationMethod.BY_AMOUNT,
    batches: BatchInfo[] = [],
  ): AllocationPreviewResult {
    const basisSum = this.computeBasisSum(targetItems, allocationMethod);

    let runningAllocated = 0;
    let maxLineItemIndex = 0;
    let maxLineItemValue = -1;

    const previewItems: AllocationPreviewItem[] = targetItems.map(
      (item, index) => {
        const qty = Number(item.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          // A receipt line always has a positive quantity; never assume 1 (ADR 0022).
          throw new BadRequestException(
            'A receipt line has no positive quantity to allocate on',
          );
        }
        const lineTotal = Number(item.totalPrice) || 0;
        // Shown on every line; required (never 1 kg) only for BY_WEIGHT.
        const unitWeight =
          allocationMethod === ExpenseAllocationMethod.BY_WEIGHT
            ? requireUnitWeight(item)
            : (knownUnitWeight(item) ?? 0);

        if (lineTotal > maxLineItemValue) {
          maxLineItemValue = lineTotal;
          maxLineItemIndex = index;
        }

        let ratio = 0;
        if (allocationMethod === ExpenseAllocationMethod.BY_AMOUNT) {
          ratio = lineTotal / basisSum;
        } else if (allocationMethod === ExpenseAllocationMethod.BY_QUANTITY) {
          ratio = qty / basisSum;
        } else if (allocationMethod === ExpenseAllocationMethod.BY_WEIGHT) {
          ratio = (qty * unitWeight) / basisSum;
        } else {
          ratio = 1 / targetItems.length;
        }

        const allocatedRaw = Math.round(totalAmount * ratio * 100) / 100;
        runningAllocated += allocatedRaw;

        // Find batch for remaining vs sold quantities
        const batch = batches.find((b) => b.productId === item.productId);
        const remainingQty = batch ? Number(batch.remainingQty) : qty;
        const soldQty = Math.max(0, qty - remainingQty);

        const initialLandedCost =
          Number(item.landedCost) > 0
            ? Number(item.landedCost)
            : Number(item.unitPrice);

        return {
          receiptItemId: item.id,
          productId: item.productId,
          productName: item.product?.name,
          sku: item.product?.sku || '',
          unitOfMeasure: item.product?.unitOfMeasure || 'piece',
          quantity: qty,
          unitPrice: Number(item.unitPrice),
          totalPrice: lineTotal,
          weight: unitWeight,
          initialLandedCost,
          allocatedAmount: allocatedRaw,
          allocatedPerUnit: 0,
          newLandedCost: 0,
          costIncreasePercent: 0,
          soldQuantity: soldQty,
          remainingQuantity: remainingQty,
          cogsAdjustment: 0,
          stockAdjustment: 0,
        };
      },
    );

    // Remainder Rule: allocate penny/tiyin drift to highest-value line item
    const remainder = Math.round((totalAmount - runningAllocated) * 100) / 100;
    if (remainder !== 0 && previewItems[maxLineItemIndex]) {
      previewItems[maxLineItemIndex].allocatedAmount =
        Math.round(
          (previewItems[maxLineItemIndex].allocatedAmount + remainder) * 100,
        ) / 100;
    }

    // Finalize unit costs and COGS / stock adjustments
    let finalAllocatedTotal = 0;
    for (const p of previewItems) {
      finalAllocatedTotal += p.allocatedAmount;
      p.allocatedPerUnit = p.quantity > 0 ? p.allocatedAmount / p.quantity : 0;
      p.newLandedCost = p.initialLandedCost + p.allocatedPerUnit;
      p.costIncreasePercent =
        p.initialLandedCost > 0
          ? (p.allocatedPerUnit / p.initialLandedCost) * 100
          : 0;

      const soldFraction = p.quantity > 0 ? p.soldQuantity / p.quantity : 0;
      p.cogsAdjustment =
        Math.round(p.allocatedAmount * soldFraction * 100) / 100;
      p.stockAdjustment =
        Math.round((p.allocatedAmount - p.cogsAdjustment) * 100) / 100;
    }

    return {
      expenseAmount: totalAmount,
      allocationMethod,
      allocatedTotal: finalAllocatedTotal,
      remainder,
      items: previewItems,
    };
  }
}

// ─── ADDITIONAL EXPENSE: ONE CONVERSION + ALLOCATION FUNCTION ────────────

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** Money is kept to 2 decimals, halves rounded up (away from zero). */
function toMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Per-unit costs are kept to 4 decimals (DECIMAL(17,4) columns). */
function toUnitCost(value: Decimal): Decimal {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/** A document's currency and its typed rate to UZS. */
export interface AllocationDocument {
  currency: string;
  exchangeRate: Numeric | null | undefined;
}

/**
 * A document's rate to UZS as stored (4 decimals). UZS is 1; USD needs its
 * own positive rate. A missing rate is an error, never 1 (ADR 0022).
 */
export function documentRateToUzs(
  doc: AllocationDocument,
  label: 'expense' | 'receipt',
): Decimal {
  const who =
    label === 'expense'
      ? "Qo'shimcha xarajat / Дополнительный расход"
      : 'Xarid / Приход';
  if (doc.currency === 'UZS') return new Decimal(1);
  if (doc.currency !== 'USD') {
    throw new BadRequestException(
      `${who}: valyuta USD yoki UZS bo'lishi shart / валюта должна быть USD или UZS (${doc.currency})`,
    );
  }
  const raw = doc.exchangeRate;
  let rate: Decimal | null = null;
  try {
    rate =
      raw == null || raw === ''
        ? null
        : new Decimal(raw).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  } catch {
    rate = null;
  }
  if (!rate || !rate.isFinite() || rate.lte(0)) {
    throw new BadRequestException(
      `${who}: ${doc.currency} kursi ko'rsatilmagan yoki 0 / курс ${doc.currency} не указан или равен 0`,
    );
  }
  return rate;
}

export interface ConvertAndAllocateInput {
  /** The receipt lines to spread over, in receipt order (ties go to the first). */
  items: AllocationTargetItem[];
  /** Expense total in the expense currency. */
  amount: Numeric;
  allocationMethod: ExpenseAllocationMethod;
  expense: AllocationDocument;
  receipt: AllocationDocument;
  /** The date the rates belong to: the expense document date. */
  rateDate: Date;
  /** The receipt's batches, for sold / remaining quantities. */
  batches?: BatchInfo[];
}

export interface ConvertedAllocationLine {
  receiptItemId: string;
  productId: string;
  productName: Prisma.JsonValue | undefined;
  sku: string;
  unitOfMeasure: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  weight: number;
  /** Receipt currency, per unit. */
  initialLandedCost: number;
  /** Share in the expense currency. */
  allocatedAmount: number;
  /** Share in the receipt currency. */
  receiptAmount: number;
  /** Share in UZS, at the expense's own rate (ADR 0008). */
  baseAmount: number;
  /** Added to the receipt line's landed cost (receipt currency, per unit). */
  receiptUnitDelta: number;
  /** Added to the batch landed cost and to sold units' COGS (UZS, per unit). */
  baseUnitDelta: number;
  /** Receipt currency, per unit. */
  newLandedCost: number;
  costIncreasePercent: number;
  soldQuantity: number;
  remainingQuantity: number;
  /** UZS. */
  cogsAdjustment: number;
  /** UZS. */
  stockAdjustment: number;
}

export interface ConvertedAllocation {
  allocationMethod: ExpenseAllocationMethod;
  currency: string;
  receiptCurrency: string;
  baseCurrency: 'UZS';
  /** Expense rate to UZS. */
  expenseRate: number;
  /** Receipt rate to UZS; equal to expenseRate when both share a currency. */
  receiptRate: number;
  rateDate: Date;
  rateSource: 'SAME_CURRENCY' | 'DOCUMENT';
  /** Totals: each column of `items` adds up to its total exactly. */
  expenseAmount: number;
  receiptTotal: number;
  baseTotal: number;
  /** The line that took the rounding leftover. */
  remainderReceiptItemId: string;
  items: ConvertedAllocationLine[];
}

/** Each line's allocation basis under the method (Decimal, never float). */
function allocationBases(
  items: AllocationTargetItem[],
  method: ExpenseAllocationMethod,
): Decimal[] {
  const bases = items.map((item) => {
    if (method === ExpenseAllocationMethod.BY_QUANTITY) {
      return new Decimal(Number(item.quantity));
    }
    if (method === ExpenseAllocationMethod.BY_WEIGHT) {
      return new Decimal(Number(item.quantity)).mul(requireUnitWeight(item));
    }
    return new Decimal(Number(item.totalPrice) || 0);
  });
  const sum = bases.reduce((s, b) => s.add(b), new Decimal(0));
  // Nothing to weigh by (e.g. free goods by amount): equal shares, as before.
  return sum.lte(0) ? items.map(() => new Decimal(1)) : bases;
}

/**
 * Splits a 2-decimal total by the bases; the rounding leftover goes on
 * `remainderIndex`, so the shares add up to the total exactly.
 */
function splitExactly(
  total: Decimal,
  bases: Decimal[],
  remainderIndex: number,
): Decimal[] {
  const basisSum = bases.reduce((s, b) => s.add(b), new Decimal(0));
  const shares = bases.map((b) => toMoney(total.mul(b).div(basisSum)));
  const allocated = shares.reduce((s, x) => s.add(x), new Decimal(0));
  shares[remainderIndex] = shares[remainderIndex].add(total.sub(allocated));
  return shares;
}

/**
 * The single conversion + allocation used by the Additional Expense preview,
 * draft save and posting (cancelling only reads what it stored).
 *
 * - Rates: each document's own rate to UZS (`documentRateToUzs`), 4 decimals.
 *   One currency converts 1:1 (the receipt rate is taken equal to the
 *   expense rate). A missing rate is an error.
 * - Totals: converted once from the expense total and rounded to 2 decimals,
 *   halves up: receipt = amount × expenseRate / receiptRate, UZS = amount ×
 *   expenseRate.
 * - Lines: every column (expense, receipt, UZS currency) is split by the same
 *   bases and rounded the same way; the leftover goes on the line with the
 *   largest basis (ties: the first line), so each column adds up exactly.
 * - Per unit: the receipt and UZS shares divided by the line quantity,
 *   rounded to 4 decimals (the scale of the per-unit cost columns they are
 *   added to), so cancelling subtracts exactly what posting added. Amounts
 *   (shares, COGS changes) stay at 2.
 */
export function convertAndAllocate(
  input: ConvertAndAllocateInput,
): ConvertedAllocation {
  const { items, allocationMethod, batches = [] } = input;
  if (items.length === 0) {
    throw new BadRequestException(
      'Taqsimlash uchun kamida bitta tovar tanlanishi shart / Выберите хотя бы один товар для распределения',
    );
  }
  const amountNumber = Number(input.amount);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    throw new BadRequestException(
      "Xarajat summasi (amount) 0 dan katta bo'lishi shart / Сумма расхода должна быть больше 0",
    );
  }
  for (const item of items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      // A receipt line always has a positive quantity; never assume 1 (ADR 0022).
      throw new BadRequestException(
        'A receipt line has no positive quantity to allocate on',
      );
    }
  }

  const expenseRate = documentRateToUzs(input.expense, 'expense');
  const sameCurrency = input.expense.currency === input.receipt.currency;
  const receiptRate = sameCurrency
    ? expenseRate
    : documentRateToUzs(input.receipt, 'receipt');

  const expenseTotal = toMoney(new Decimal(amountNumber));
  const receiptTotal = sameCurrency
    ? expenseTotal
    : toMoney(expenseTotal.mul(expenseRate).div(receiptRate));
  const baseTotal = toMoney(expenseTotal.mul(expenseRate));

  const bases = allocationBases(items, allocationMethod);
  let remainderIndex = 0;
  bases.forEach((b, i) => {
    if (b.gt(bases[remainderIndex])) remainderIndex = i;
  });

  const original = splitExactly(expenseTotal, bases, remainderIndex);
  const inReceipt = splitExactly(receiptTotal, bases, remainderIndex);
  const inBase = splitExactly(baseTotal, bases, remainderIndex);

  const lines = items.map((item, i): ConvertedAllocationLine => {
    const qty = new Decimal(Number(item.quantity));
    const receiptUnitDelta = toUnitCost(inReceipt[i].div(qty));
    const baseUnitDelta = toUnitCost(inBase[i].div(qty));

    const batch = batches.find((b) => b.productId === item.productId);
    const remainingQty = batch ? Number(batch.remainingQty) : qty.toNumber();
    const soldQty = Math.max(0, qty.toNumber() - remainingQty);
    const cogsAdjustment = toMoney(baseUnitDelta.mul(soldQty));

    const initialLandedCost =
      Number(item.landedCost) > 0
        ? Number(item.landedCost)
        : Number(item.unitPrice);
    const unitWeight =
      allocationMethod === ExpenseAllocationMethod.BY_WEIGHT
        ? requireUnitWeight(item)
        : (knownUnitWeight(item) ?? 0);

    return {
      receiptItemId: item.id,
      productId: item.productId,
      productName: item.product?.name,
      sku: item.product?.sku || '',
      unitOfMeasure: item.product?.unitOfMeasure || 'piece',
      quantity: qty.toNumber(),
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice) || 0,
      weight: unitWeight,
      initialLandedCost,
      allocatedAmount: original[i].toNumber(),
      receiptAmount: inReceipt[i].toNumber(),
      baseAmount: inBase[i].toNumber(),
      receiptUnitDelta: receiptUnitDelta.toNumber(),
      baseUnitDelta: baseUnitDelta.toNumber(),
      newLandedCost: new Decimal(initialLandedCost)
        .add(receiptUnitDelta)
        .toNumber(),
      costIncreasePercent:
        initialLandedCost > 0
          ? receiptUnitDelta.div(initialLandedCost).mul(100).toNumber()
          : 0,
      soldQuantity: soldQty,
      remainingQuantity: remainingQty,
      cogsAdjustment: cogsAdjustment.toNumber(),
      stockAdjustment: inBase[i].sub(cogsAdjustment).toNumber(),
    };
  });

  return {
    allocationMethod,
    currency: input.expense.currency,
    receiptCurrency: input.receipt.currency,
    baseCurrency: 'UZS',
    expenseRate: expenseRate.toNumber(),
    receiptRate: receiptRate.toNumber(),
    rateDate: input.rateDate,
    rateSource: sameCurrency ? 'SAME_CURRENCY' : 'DOCUMENT',
    expenseAmount: expenseTotal.toNumber(),
    receiptTotal: receiptTotal.toNumber(),
    baseTotal: baseTotal.toNumber(),
    remainderReceiptItemId: items[remainderIndex].id,
    items: lines,
  };
}

/**
 * Spreads every receipt expense over the lines by its own method and sums the
 * shares per line (receipt currency). Each expense keeps the remainder rule,
 * so the line shares add up to the expense total exactly.
 */
export function allocateReceiptExpenses(
  items: AllocationTargetItem[],
  expenses: { amount: number; allocationMethod: ExpenseAllocationMethod }[],
): Map<string, number> {
  const byLine = new Map<string, number>(items.map((i) => [i.id, 0]));
  for (const expense of expenses) {
    const { items: shares } = ExpenseAllocationEngine.allocateExpense(
      items,
      expense.amount,
      expense.allocationMethod,
    );
    for (const share of shares) {
      byLine.set(
        share.receiptItemId,
        Math.round(
          ((byLine.get(share.receiptItemId) ?? 0) + share.allocatedAmount) *
            100,
        ) / 100,
      );
    }
  }
  return byLine;
}

/**
 * A receipt expense is allocated before posting (ADR 0002); a posted
 * receipt's cost changes only through an Additional Expense document
 * (ADR 0008), which converts at its own rate and revalues batches, sales
 * COGS and the journal.
 */
export function assertReceiptOpenForExpense(status: string): void {
  if (status !== 'DRAFT') {
    throw new BadRequestException(
      "Tasdiqlangan xaridga xarajat faqat 'Qo'shimcha xarajat' hujjati orqali qo'shiladi",
    );
  }
}

/**
 * The allocation is added to line totals in the receipt's currency and
 * converted to UZS at the receipt rate when posting, so the expense must be
 * in that currency: amounts in different currencies are never summed
 * (ADR 0023). An expense in another currency goes through an Additional
 * Expense document, which carries its own rate (ADR 0008).
 */
export function assertExpenseCurrencyMatchesReceipt(
  expenseCurrency: string,
  receiptCurrency: string,
): void {
  if (expenseCurrency !== receiptCurrency) {
    throw new BadRequestException(
      `Xarajat valyutasi (${expenseCurrency}) xarid valyutasiga (${receiptCurrency}) teng bo'lishi shart; boshqa valyutadagi xarajatni 'Qo'shimcha xarajat' hujjati orqali kiriting`,
    );
  }
}

export interface ReceiptExpensePayeeInput {
  id: string;
  supplierId: string | null;
  amount: Numeric;
}

export interface ThirdPartyReceiptExpense {
  expenseId: string;
  supplierId: string;
  amount: number;
}

/**
 * Who is owed each receipt expense. An expense with no supplier, or with the
 * receipt's own supplier, is on that supplier's invoice and adds to its
 * payable; an expense with another supplier (a carrier, a customs broker) is
 * owed to that supplier. Every expense still goes into landed cost.
 */
export function splitReceiptExpensesByPayee(
  expenses: ReceiptExpensePayeeInput[],
  receiptSupplierId: string,
): { receiptSupplierAmount: number; thirdParty: ThirdPartyReceiptExpense[] } {
  let receiptSupplierAmount = 0;
  const thirdParty: ThirdPartyReceiptExpense[] = [];
  for (const expense of expenses) {
    const amount = Number(expense.amount);
    if (!expense.supplierId || expense.supplierId === receiptSupplierId) {
      receiptSupplierAmount += amount;
    } else {
      thirdParty.push({
        expenseId: expense.id,
        supplierId: expense.supplierId,
        amount,
      });
    }
  }
  return {
    receiptSupplierAmount: Math.round(receiptSupplierAmount * 100) / 100,
    thirdParty,
  };
}

/**
 * The receipt total: what the receipt's own supplier is owed (lines after
 * discount, VAT, and the expenses on its invoice). Expenses owed to other
 * suppliers are in `additionalExpensesTotal` (landed cost) but not here.
 */
export function receiptSupplierTotal(
  amounts: {
    subtotalAmount: Numeric;
    discountAmount: Numeric;
    vatAmount: Numeric;
  },
  expenses: ReceiptExpensePayeeInput[],
  receiptSupplierId: string,
): number {
  const { receiptSupplierAmount } = splitReceiptExpensesByPayee(
    expenses,
    receiptSupplierId,
  );
  return (
    Math.round(
      (Number(amounts.subtotalAmount) -
        Number(amounts.discountAmount) +
        Number(amounts.vatAmount) +
        receiptSupplierAmount) *
        100,
    ) / 100
  );
}

export interface ReceiptLineAllocation {
  allocatedExpenses: number;
  landedCost: number;
}

/**
 * Each line's share of the receipt expenses and its landed unit cost (line
 * total after discount and VAT plus the share, per unit; receipt currency).
 * Lines whose `allocatedExpenses` no longer add up to the expenses (a draft
 * whose lines were replaced) are brought back in line with this.
 */
export function allocateReceiptLines(
  items: (AllocationTargetItem & { totalPrice: Numeric })[],
  expenses: { amount: Numeric; allocationMethod: ExpenseAllocationMethod }[],
): Map<string, ReceiptLineAllocation> {
  const shares =
    expenses.length > 0
      ? allocateReceiptExpenses(
          items,
          expenses.map((e) => ({
            amount: Number(e.amount),
            allocationMethod: e.allocationMethod,
          })),
        )
      : new Map<string, number>();
  const result = new Map<string, ReceiptLineAllocation>();
  for (const item of items) {
    const qty = Number(item.quantity);
    const allocatedExpenses = shares.get(item.id) ?? 0;
    result.set(item.id, {
      allocatedExpenses,
      landedCost:
        qty > 0 ? (Number(item.totalPrice) + allocatedExpenses) / qty : 0,
    });
  }
  return result;
}

/** True when the lines' shares add up to the receipt expenses (to the tiyin). */
export function lineAllocationsMatchExpenses(
  items: { allocatedExpenses?: Numeric | null }[],
  expenses: { amount: Numeric }[],
): boolean {
  const allocated = items.reduce(
    (sum, i) => sum + Number(i.allocatedExpenses ?? 0),
    0,
  );
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  return Math.abs(allocated - total) < 0.005;
}

/** An allocation line as stored on an Additional Expense (snapshot columns). */
export interface StoredAllocationLine {
  receiptItemId: string;
  originalCurrency: string | null;
  expenseRate: Numeric | null;
  receiptRate: Numeric | null;
  rateSource: string | null;
  rateDate: Date | null;
  initialLandedCost: Numeric;
  allocatedAmount: Numeric;
  newLandedCost: Numeric;
  receiptAmount: Numeric | null;
  baseAmount: Numeric | null;
  receiptUnitDelta: Numeric | null;
  baseUnitDelta: Numeric | null;
}

/**
 * What differs between a draft's stored snapshot and a fresh
 * convertAndAllocate() result, field by field and exactly (the fresh values
 * are already at the stored precision, so no tolerance is needed). Sold and
 * remaining quantities are not compared: they are facts of the posting
 * moment. A draft without a snapshot (saved before it existed) differs.
 */
export function allocationSnapshotDifferences(
  stored: StoredAllocationLine[],
  fresh: ConvertedAllocation,
): string[] {
  const differences: string[] = [];
  if (stored.length !== fresh.items.length) {
    differences.push(`lines ${stored.length} → ${fresh.items.length}`);
  }
  const sameNumber = (a: Numeric | null, b: number) =>
    a != null && new Decimal(a).eq(b);

  for (const row of stored) {
    const line = fresh.items.find((l) => l.receiptItemId === row.receiptItemId);
    if (!line) {
      differences.push(`line ${row.receiptItemId} is no longer allocated`);
      continue;
    }
    if (row.originalCurrency == null) {
      differences.push(`line ${row.receiptItemId} has no saved conversion`);
      continue;
    }
    const checks: [string, boolean][] = [
      ['currency', row.originalCurrency === fresh.currency],
      ['expenseRate', sameNumber(row.expenseRate, fresh.expenseRate)],
      ['receiptRate', sameNumber(row.receiptRate, fresh.receiptRate)],
      ['rateSource', row.rateSource === fresh.rateSource],
      [
        'rateDate',
        row.rateDate != null &&
          new Date(row.rateDate).getTime() === fresh.rateDate.getTime(),
      ],
      [
        'initialLandedCost',
        sameNumber(row.initialLandedCost, line.initialLandedCost),
      ],
      [
        'allocatedAmount',
        sameNumber(row.allocatedAmount, line.allocatedAmount),
      ],
      ['receiptAmount', sameNumber(row.receiptAmount, line.receiptAmount)],
      ['baseAmount', sameNumber(row.baseAmount, line.baseAmount)],
      [
        'receiptUnitDelta',
        sameNumber(row.receiptUnitDelta, line.receiptUnitDelta),
      ],
      ['baseUnitDelta', sameNumber(row.baseUnitDelta, line.baseUnitDelta)],
      ['newLandedCost', sameNumber(row.newLandedCost, line.newLandedCost)],
    ];
    for (const [field, same] of checks) {
      if (!same) differences.push(`${row.receiptItemId}.${field}`);
    }
  }
  return differences;
}
