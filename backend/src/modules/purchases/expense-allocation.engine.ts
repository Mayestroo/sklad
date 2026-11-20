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
